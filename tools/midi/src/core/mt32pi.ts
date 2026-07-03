import type { MidiOutput } from '../ports/midiOutput.ts'

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
} as const

// Matches TMT32ROMSet's declaration order in mt32-pi (include/synth/mt32romset.h).
export const MT32_ROM_SETS: Record<string, number> = { old: 0, new: 1, cm32l: 2, any: 3, all: 4 }

// Matches TSynth's declaration order in mt32-pi (include/synth/synth.h).
export const MT32_SYNTHS: Record<string, number> = { mt32: 0, soundfont: 1 }

// Classic Roland MT-32 part layout: melodic parts live on MIDI channels 2-9
// (1-based) — channel 1 has no part assigned and produces no sound in MT-32
// mode. Channel 10 is rhythm, same as General MIDI.
export const MT32_MELODIC_CHANNELS = [2, 3, 4, 5, 6, 7, 8, 9]
export const MT32_RHYTHM_CHANNEL = 10
export const MT32_DEFAULT_TEST_CHANNEL = 2

function sysex(...bytes: number[]): number[] {
  return [0xf0, MANUFACTURER_ID, ...bytes, 0xf7]
}

function resolveByteParam(named: Record<string, number>, value: string | number, label: string): number {
  const byte = named[String(value)] ?? value
  if (typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 0xff) {
    throw new Error(`Unknown ${label}: ${value}`)
  }
  return byte
}

export function rebootSysEx(): number[] {
  return sysex(COMMAND.reboot)
}

export function switchRomSetSysEx(romSet: string | number): number[] {
  return sysex(COMMAND.switchRomSet, resolveByteParam(MT32_ROM_SETS, romSet, 'MT-32 ROM set'))
}

export function switchSoundFontSysEx(index: string | number): number[] {
  return sysex(COMMAND.switchSoundFont, resolveByteParam({}, index, 'SoundFont index'))
}

export function switchSynthSysEx(synth: string | number): number[] {
  return sysex(COMMAND.switchSynth, resolveByteParam(MT32_SYNTHS, synth, 'synth'))
}

export function setReversedStereoSysEx(on: boolean): number[] {
  return sysex(COMMAND.setReversedStereo, on ? 1 : 0)
}

// Thin convenience wrapper around any MIDI output (UDP or USB — anything with
// a `.send(type, data)` method) that speaks the mt32-pi custom SysEx protocol.
// Generic over the output so callers keep transport extras (e.g. .close()).
export class Mt32Pi<T extends MidiOutput = MidiOutput> {
  readonly out: T

  constructor(out: T) {
    this.out = out
  }

  reboot(): void {
    this.out.send('sysex', rebootSysEx())
  }

  switchRomSet(romSet: string | number): void {
    this.out.send('sysex', switchRomSetSysEx(romSet))
  }

  switchSoundFont(index: string | number): void {
    this.out.send('sysex', switchSoundFontSysEx(index))
  }

  switchSynth(synth: string | number): void {
    this.out.send('sysex', switchSynthSysEx(synth))
  }

  setReversedStereo(on: boolean): void {
    this.out.send('sysex', setReversedStereoSysEx(on))
  }
}
