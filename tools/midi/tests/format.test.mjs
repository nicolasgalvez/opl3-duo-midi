import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectFormat } from '../lib/format.mjs'

test('detectFormat: MThd magic is midi', () => {
  assert.equal(detectFormat(Buffer.from('MThd0000', 'ascii')), 'midi')
})

test('detectFormat: RIFF (RMID-wrapped MIDI) is midi', () => {
  assert.equal(detectFormat(Buffer.from('RIFFxxxxRMID', 'ascii')), 'midi')
})

test('detectFormat: "Vgm " magic is vgm', () => {
  assert.equal(detectFormat(Buffer.from('Vgm \x00\x00\x00\x00', 'ascii')), 'vgm')
})

test('detectFormat: unrecognized content is null', () => {
  assert.equal(detectFormat(Buffer.from('garbage!', 'ascii')), null)
})

test('detectFormat: detection is by content, not filename — a renamed VGM still detects as vgm', () => {
  const vgm = Buffer.from('Vgm \x00\x00\x00\x00', 'ascii')
  assert.equal(detectFormat(vgm), 'vgm') // detectFormat never sees a path, only bytes
})

test('detectFormat: buffers shorter than the magic are null, not a throw', () => {
  assert.equal(detectFormat(Buffer.from('Vg', 'ascii')), null)
  assert.equal(detectFormat(Buffer.alloc(0)), null)
})
