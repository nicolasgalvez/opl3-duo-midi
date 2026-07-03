/**
 * OPL3 Duo! USB-MIDI synth for Teensy 4.1 — OOP edition.
 *
 *   Ableton  --USB MIDI-->  Teensy  --SPI-->  OPL3 Duo!  --audio out-->  speakers
 *
 * A rotary encoder selects the General MIDI patch for one channel; an optional
 * SSD1306 shows the patch name (enable with OLED_ENABLED in Config.h).
 *
 * Design: each concern is its own class. loop() runs usbMIDI.read() every pass
 * and never does slow I/O inline, so turning the knob or drawing the screen can
 * never starve MIDI (the bug that made the old procedural version flaky).
 */
#include <Arduino.h>
#include <SPI.h>

#include "Config.h"
#include "GMNames.h"
#include "OplSynth.h"
#include "PatchDisplay.h"
#include "PatchEncoder.h"

// ---- Components -----------------------------------------------------------
OplSynth synth;
PatchEncoder patchEncoder(cfg::ENC_PIN_A, cfg::ENC_PIN_B, cfg::ENC_BTN_PIN, cfg::GM_PROGRAM_MIN,
                          cfg::GM_PROGRAM_MAX);
PatchDisplay display;

// ---- usbMIDI trampolines (usbMIDI wants plain function pointers) ----------
static void onNoteOn(byte ch, byte note, byte vel) { synth.noteOn(ch, note, vel); }
static void onNoteOff(byte ch, byte note, byte vel) { synth.noteOff(ch, note, vel); }
static void onProgramChange(byte ch, byte program) {
  synth.programChange(ch, program);
  if ((ch % 16) == cfg::ENC_TARGET_CHANNEL) {
    patchEncoder.setValue(program);
    display.show(program, gmInstrumentName(program));
  }
}
static void onControlChange(byte ch, byte ctrl, byte val) { synth.controlChange(ch, ctrl, val); }
static void onPitchChange(byte ch, int pitch) { synth.pitchChange(ch, pitch); }
static void onAfterTouch(byte ch, byte pressure) { synth.afterTouch(ch, pressure); }
static void onSystemReset() {
  synth.systemReset();
  patchEncoder.setValue(synth.program(cfg::ENC_TARGET_CHANNEL));
  display.show(patchEncoder.value(), gmInstrumentName(patchEncoder.value()));
}

// Raw OPL register-write SysEx (ODM-15: VGM playback streams a file's actual
// register log 1:1, bypassing GM voice allocation entirely):
//   F0 7D 7F <bank> <regHiNibble> <regLoNibble> <valHiNibble> <valLoNibble> F7
// 0x7D is MIDI's non-commercial/educational manufacturer ID — also used by the
// unrelated mt32-pi device-control protocol (tools/midi/lib/net/mt32pi.mjs);
// different target device, disambiguated here by the 0x7F sub-command byte.
// reg/value are nibble-split into 7-bit-safe SysEx data bytes.
constexpr uint8_t SYSEX_MANUFACTURER_ID = 0x7D;
constexpr uint8_t SYSEX_RAW_WRITE = 0x7F;
static void onSysEx(uint8_t* data, unsigned int size) {
  if (size != 9 || data[0] != 0xF0 || data[8] != 0xF7) return;
  if (data[1] != SYSEX_MANUFACTURER_ID || data[2] != SYSEX_RAW_WRITE) return;

  uint8_t bank = data[3];
  uint8_t reg = (data[4] << 4) | data[5];
  uint8_t value = (data[6] << 4) | data[7];
  synth.rawWrite(bank, reg, value);
}

void setup() {
  usbMIDI.setHandleNoteOn(onNoteOn);
  usbMIDI.setHandleNoteOff(onNoteOff);
  usbMIDI.setHandleProgramChange(onProgramChange);
  usbMIDI.setHandleControlChange(onControlChange);
  usbMIDI.setHandlePitchChange(onPitchChange);
  usbMIDI.setHandleAfterTouch(onAfterTouch);
  usbMIDI.setHandleSystemReset(onSystemReset);
  usbMIDI.setHandleSystemExclusive(onSysEx);

  synth.begin();
  patchEncoder.begin();
  display.begin();

  if (cfg::LED_VU_ENABLED) {
    pinMode(cfg::LED_L_PIN, OUTPUT);
    pinMode(cfg::LED_R_PIN, OUTPUT);
  }

  // Sync the knob + screen to the target channel's current (boot) patch.
  patchEncoder.setValue(synth.program(cfg::ENC_TARGET_CHANNEL));
  display.show(patchEncoder.value(), gmInstrumentName(patchEncoder.value()));
}

void loop() {
  usbMIDI.read();  // hot path: every iteration, never blocked

  if (patchEncoder.update()) {  // non-blocking poll
    uint8_t program = static_cast<uint8_t>(patchEncoder.value());
    synth.setProgram(cfg::ENC_TARGET_CHANNEL, program);
    display.show(program, gmInstrumentName(program));  // just flags dirty
  }

  if (patchEncoder.buttonPressed()) {
    synth.panic();  // tap the knob = all notes off
  }

  synth.update();            // modulation / aftertouch LFO + L/R VU levels
  display.update(millis());  // throttled, dirty-flag render (no-op if disabled)

  if (cfg::LED_VU_ENABLED) {  // drive the L/R VU LEDs (squared = nicer fade)
    const float l = synth.levelLeft();
    const float r = synth.levelRight();
    analogWrite(cfg::LED_L_PIN, static_cast<int>(l * l * 255.0f));
    analogWrite(cfg::LED_R_PIN, static_cast<int>(r * r * 255.0f));
  }
}
