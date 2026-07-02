import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeMidiMessage } from '../lib/net/midiBytes.mjs'

test('encodeMidiMessage: noteon', () => {
  assert.deepEqual(encodeMidiMessage('noteon', { note: 60, velocity: 100, channel: 0 }), [0x90, 60, 100])
})

test('encodeMidiMessage: noteon channel offset', () => {
  assert.deepEqual(encodeMidiMessage('noteon', { note: 60, velocity: 100, channel: 1 }), [0x91, 60, 100])
})

test('encodeMidiMessage: noteon defaults channel to 0 when omitted', () => {
  assert.deepEqual(encodeMidiMessage('noteon', { note: 60, velocity: 100 }), [0x90, 60, 100])
})

test('encodeMidiMessage: noteoff', () => {
  assert.deepEqual(encodeMidiMessage('noteoff', { note: 60, velocity: 0, channel: 9 }), [0x89, 60, 0])
})

test('encodeMidiMessage: cc', () => {
  assert.deepEqual(encodeMidiMessage('cc', { controller: 7, value: 100, channel: 0 }), [0xb0, 7, 100])
})

test('encodeMidiMessage: program', () => {
  assert.deepEqual(encodeMidiMessage('program', { number: 24, channel: 2 }), [0xc2, 24])
})

test('encodeMidiMessage: pitch center value (8192) splits into lsb/msb', () => {
  assert.deepEqual(encodeMidiMessage('pitch', { value: 8192, channel: 0 }), [0xe0, 0, 64])
})

test('encodeMidiMessage: pitch min value (0)', () => {
  assert.deepEqual(encodeMidiMessage('pitch', { value: 0, channel: 0 }), [0xe0, 0, 0])
})

test('encodeMidiMessage: pitch max value (16383)', () => {
  assert.deepEqual(encodeMidiMessage('pitch', { value: 16383, channel: 0 }), [0xe0, 127, 127])
})

test('encodeMidiMessage: sysex passes bytes through unchanged', () => {
  const bytes = [0xf0, 0x7d, 0x00, 0xf7]
  assert.deepEqual(encodeMidiMessage('sysex', bytes), bytes)
})

test('encodeMidiMessage: sysex rejects a message not starting with 0xf0', () => {
  assert.throws(() => encodeMidiMessage('sysex', [0x00, 0x7d, 0x00, 0xf7]))
})

test('encodeMidiMessage: sysex rejects a message not ending with 0xf7', () => {
  assert.throws(() => encodeMidiMessage('sysex', [0xf0, 0x7d, 0x00, 0x00]))
})

test('encodeMidiMessage: sysex rejects a too-short message', () => {
  assert.throws(() => encodeMidiMessage('sysex', [0xf0, 0xf7]))
})

test('encodeMidiMessage: unknown type throws', () => {
  assert.throws(() => encodeMidiMessage('nonsense', {}))
})
