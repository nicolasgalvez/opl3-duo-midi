#pragma once
#include <Arduino.h>
#include <OPL3Duo.h>
#include "Config.h"

// FM synth engine for the OPL3 Duo: owns the chip, the voice-allocation pool and
// all MIDI handling. The note/voice algorithm is the proven one from the library's
// OPL3Duo "TeensyMidi" example, encapsulated here as a single object instead of a
// pile of file-scope globals.
//
// usbMIDI wants plain function pointers, so main.cpp keeps a single OplSynth
// instance and forwards events to these methods via small trampoline functions.
class OplSynth {
public:
  OplSynth();

  void begin();          // full init + system reset
  void update();         // call every loop(): runs the modulation/aftertouch LFO

  // MIDI events (channels are passed through as received, 1..16).
  void noteOn(uint8_t channel, uint8_t note, uint8_t velocity);
  void noteOff(uint8_t channel, uint8_t note, uint8_t velocity);
  void programChange(uint8_t channel, uint8_t program);
  void controlChange(uint8_t channel, uint8_t control, uint8_t value);
  void pitchChange(uint8_t channel, int pitch);
  void afterTouch(uint8_t channel, uint8_t pressure);
  void systemReset();

  // Local (non-MIDI) control, used by the encoder to re-patch a channel.
  void    setProgram(uint8_t channel, uint8_t program);
  uint8_t program(uint8_t channel) const;

  void panic();          // immediate all-sound / all-notes off

private:
  static constexpr uint8_t NUM_MIDI_CHANNELS    = 16;
  static constexpr uint8_t NUM_MELODIC_CHANNELS = 12;
  static constexpr uint8_t NUM_DRUM_CHANNELS    = 12;
  static constexpr uint8_t MIDI_DRUM_CHANNEL    = 10;
  static constexpr uint8_t VALUE_UNDEFINED      = 255;
  static constexpr uint8_t DRUM_NOTE_BASE       = 27;
  static constexpr uint8_t NUM_MIDI_DRUMS       = 60;

  struct MidiChannel {
    Instrument4OP instrument;
    uint8_t  program     = 0;
    float    volume      = 0.8f;    // CC7  channel volume
    float    expression  = 1.0f;    // CC11 expression (multiplies into volume)
    float    modulation  = 0.0f;    // CC1  mod wheel
    float    afterTouch  = 0.0f;
    uint32_t tAfterTouch = 0;
    bool     sustain     = false;   // CC64 sustain pedal held
    bool     panLeft     = true;    // CC10 pan -> OPL3 stereo enable bits
    bool     panRight    = true;
  };

  struct OplChannel {
    uint32_t eventIndex   = 0;
    uint8_t  midiChannel  = 0;
    uint8_t  program      = VALUE_UNDEFINED;
    uint8_t  note         = VALUE_UNDEFINED;
    uint8_t  transpose    = 0;
    float    noteVelocity = 0.0f;
    bool     sustained    = false;  // note-off arrived while sustain pedal was down
  };

  void playMelodic(uint8_t midiChannel, uint8_t note, uint8_t velocity);
  void playDrum(uint8_t note, uint8_t velocity);
  void setOplChannelVolume(uint8_t channel4OP, uint8_t midiChannel);
  void applyPanning(uint8_t channel4OP, uint8_t midiChannel);

  OPL3Duo     _opl3;
  MidiChannel _midi[NUM_MIDI_CHANNELS];
  OplChannel  _melodic[NUM_MELODIC_CHANNELS];
  OplChannel  _drums[NUM_DRUM_CHANNELS];
  uint32_t    _eventIndex = 0;
};
