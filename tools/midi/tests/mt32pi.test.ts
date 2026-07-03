import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rebootSysEx,
  switchRomSetSysEx,
  switchSoundFontSysEx,
  switchSynthSysEx,
  setReversedStereoSysEx,
  MT32_ROM_SETS,
  MT32_SYNTHS,
  MT32_MELODIC_CHANNELS,
  Mt32Pi,
} from '../src/core/mt32pi.ts'
import type { MidiMessageData, MidiMessageType } from '../src/contracts/midi.ts'
import type { MidiOutput } from '../src/ports/midiOutput.ts'

// Byte layout confirmed against ~/code/mt32-pi src/mt32pi.cpp (TCustomSysExCommand, ParseCustomSysEx).

test('rebootSysEx: F0 7D 00 F7', () => {
  assert.deepEqual(rebootSysEx(), [0xf0, 0x7d, 0x00, 0xf7])
})

test('switchRomSetSysEx: F0 7D 01 xx F7 by name', () => {
  assert.deepEqual(switchRomSetSysEx('old'), [0xf0, 0x7d, 0x01, 0x00, 0xf7])
  assert.deepEqual(switchRomSetSysEx('new'), [0xf0, 0x7d, 0x01, 0x01, 0xf7])
  assert.deepEqual(switchRomSetSysEx('cm32l'), [0xf0, 0x7d, 0x01, 0x02, 0xf7])
  assert.deepEqual(switchRomSetSysEx('any'), [0xf0, 0x7d, 0x01, 0x03, 0xf7])
  assert.deepEqual(switchRomSetSysEx('all'), [0xf0, 0x7d, 0x01, 0x04, 0xf7])
})

test('switchRomSetSysEx: accepts a raw numeric value too', () => {
  assert.deepEqual(switchRomSetSysEx(2), [0xf0, 0x7d, 0x01, 0x02, 0xf7])
})

test('switchRomSetSysEx: rejects an unknown name', () => {
  assert.throws(() => switchRomSetSysEx('nonsense'))
})

test('MT32_ROM_SETS matches the device enum ordinals', () => {
  assert.deepEqual(MT32_ROM_SETS, { old: 0, new: 1, cm32l: 2, any: 3, all: 4 })
})

test('switchSoundFontSysEx: F0 7D 02 xx F7', () => {
  assert.deepEqual(switchSoundFontSysEx(0), [0xf0, 0x7d, 0x02, 0x00, 0xf7])
  assert.deepEqual(switchSoundFontSysEx(12), [0xf0, 0x7d, 0x02, 0x0c, 0xf7])
})

test('switchSoundFontSysEx: rejects a non-integer index', () => {
  assert.throws(() => switchSoundFontSysEx(-1))
  assert.throws(() => switchSoundFontSysEx(1.5))
  assert.throws(() => switchSoundFontSysEx(256))
})

test('switchSynthSysEx: F0 7D 03 xx F7 by name', () => {
  assert.deepEqual(switchSynthSysEx('mt32'), [0xf0, 0x7d, 0x03, 0x00, 0xf7])
  assert.deepEqual(switchSynthSysEx('soundfont'), [0xf0, 0x7d, 0x03, 0x01, 0xf7])
})

test('MT32_SYNTHS matches the device enum ordinals', () => {
  assert.deepEqual(MT32_SYNTHS, { mt32: 0, soundfont: 1 })
})

test('setReversedStereoSysEx: F0 7D 04 xx F7', () => {
  assert.deepEqual(setReversedStereoSysEx(true), [0xf0, 0x7d, 0x04, 0x01, 0xf7])
  assert.deepEqual(setReversedStereoSysEx(false), [0xf0, 0x7d, 0x04, 0x00, 0xf7])
})

test('MT32_MELODIC_CHANNELS is channels 2-9 (1-based); channel 1 and 10 excluded', () => {
  assert.deepEqual(MT32_MELODIC_CHANNELS, [2, 3, 4, 5, 6, 7, 8, 9])
})

test('Mt32Pi wraps a generic MIDI output and sends the correct sysex bytes', () => {
  const sent: { type: MidiMessageType; data: MidiMessageData | undefined }[] = []
  const out: MidiOutput = {
    send: (type, data) => {
      sent.push({ type, data })
    },
  }
  const device = new Mt32Pi(out)

  device.reboot()
  device.switchRomSet('cm32l')
  device.switchSoundFont(3)
  device.switchSynth('soundfont')
  device.setReversedStereo(true)

  assert.deepEqual(
    sent.map((m) => m.data),
    [
      rebootSysEx(),
      switchRomSetSysEx('cm32l'),
      switchSoundFontSysEx(3),
      switchSynthSysEx('soundfont'),
      setReversedStereoSysEx(true),
    ],
  )
  assert.ok(sent.every((m) => m.type === 'sysex'))
})
