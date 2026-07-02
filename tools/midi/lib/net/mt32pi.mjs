// mt32-pi's custom SysEx device-control protocol (manufacturer ID 0x7D).
// Byte layout confirmed against the mt32-pi firmware source
// (src/mt32pi.cpp: TCustomSysExCommand, CMT32Pi::ParseCustomSysEx):
//   F0 7D 00          F7   reboot
//   F0 7D 01 <romSet> F7   switch MT-32 ROM set
//   F0 7D 02 <index>  F7   switch SoundFont
//   F0 7D 03 <synth>  F7   switch synth (MT-32 / SoundFont)
//   F0 7D 04 <0|1>    F7   set reversed stereo

const MANUFACTURER_ID = 0x7d

const COMMAND = {
  reboot: 0x00,
  switchRomSet: 0x01,
  switchSoundFont: 0x02,
  switchSynth: 0x03,
  setReversedStereo: 0x04,
}

// Matches TMT32ROMSet's declaration order in mt32-pi (include/synth/mt32romset.h).
export const MT32_ROM_SETS = { old: 0, new: 1, cm32l: 2, any: 3, all: 4 }

// Matches TSynth's declaration order in mt32-pi (include/synth/synth.h).
export const MT32_SYNTHS = { mt32: 0, soundfont: 1 }

// Classic Roland MT-32 part layout: melodic parts live on MIDI channels 2-9
// (1-based) — channel 1 has no part assigned and produces no sound in MT-32
// mode. Channel 10 is rhythm, same as General MIDI.
export const MT32_MELODIC_CHANNELS = [2, 3, 4, 5, 6, 7, 8, 9]
export const MT32_RHYTHM_CHANNEL = 10
export const MT32_DEFAULT_TEST_CHANNEL = 2

function sysex(...bytes) {
  return [0xf0, MANUFACTURER_ID, ...bytes, 0xf7]
}

function resolveByteParam(named, value, label) {
  const byte = named[value] ?? value
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) throw new Error(`Unknown ${label}: ${value}`)
  return byte
}

export function rebootSysEx() {
  return sysex(COMMAND.reboot)
}

export function switchRomSetSysEx(romSet) {
  return sysex(COMMAND.switchRomSet, resolveByteParam(MT32_ROM_SETS, romSet, 'MT-32 ROM set'))
}

export function switchSoundFontSysEx(index) {
  return sysex(COMMAND.switchSoundFont, resolveByteParam({}, index, 'SoundFont index'))
}

export function switchSynthSysEx(synth) {
  return sysex(COMMAND.switchSynth, resolveByteParam(MT32_SYNTHS, synth, 'synth'))
}

export function setReversedStereoSysEx(on) {
  return sysex(COMMAND.setReversedStereo, on ? 1 : 0)
}

// Thin convenience wrapper around any MIDI output (UDP or USB — anything with
// a `.send(type, data)` method) that speaks the mt32-pi custom SysEx protocol.
export class Mt32Pi {
  constructor(out) {
    this.out = out
  }

  reboot() {
    this.out.send('sysex', rebootSysEx())
  }

  switchRomSet(romSet) {
    this.out.send('sysex', switchRomSetSysEx(romSet))
  }

  switchSoundFont(index) {
    this.out.send('sysex', switchSoundFontSysEx(index))
  }

  switchSynth(synth) {
    this.out.send('sysex', switchSynthSysEx(synth))
  }

  setReversedStereo(on) {
    this.out.send('sysex', setReversedStereoSysEx(on))
  }
}
