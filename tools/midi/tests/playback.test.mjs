import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextPlaylistIndex, prevPlaylistIndex, shuffleOrder } from '../lib/playback.mjs'

test('nextPlaylistIndex sequential stops at end without repeat', () => {
  assert.equal(nextPlaylistIndex({ index: 0, length: 3, repeat: false, shuffle: false }), 1)
  assert.equal(nextPlaylistIndex({ index: 2, length: 3, repeat: false, shuffle: false }), null)
})

test('nextPlaylistIndex sequential wraps with repeat', () => {
  assert.equal(nextPlaylistIndex({ index: 2, length: 3, repeat: true, shuffle: false }), 0)
})

test('nextPlaylistIndex shuffle walks order then stops', () => {
  const order = [2, 0, 1]
  assert.equal(nextPlaylistIndex({ index: 2, length: 3, repeat: false, shuffle: true, order }), 0)
  assert.equal(nextPlaylistIndex({ index: 0, length: 3, repeat: false, shuffle: true, order }), 1)
  assert.equal(nextPlaylistIndex({ index: 1, length: 3, repeat: false, shuffle: true, order }), null)
})

test('nextPlaylistIndex shuffle wraps with repeat', () => {
  const order = [1, 0]
  assert.equal(nextPlaylistIndex({ index: 0, length: 2, repeat: true, shuffle: true, order }), 1)
  assert.equal(nextPlaylistIndex({ index: 1, length: 2, repeat: true, shuffle: true, order }), 0)
})

test('prevPlaylistIndex sequential clamps at start', () => {
  assert.equal(prevPlaylistIndex({ index: 2, length: 3, shuffle: false }), 1)
  assert.equal(prevPlaylistIndex({ index: 0, length: 3, shuffle: false }), 0)
})

test('prevPlaylistIndex shuffle walks order backward', () => {
  const order = [2, 0, 1]
  assert.equal(prevPlaylistIndex({ index: 0, length: 3, shuffle: true, order }), 2)
  assert.equal(prevPlaylistIndex({ index: 2, length: 3, shuffle: true, order }), 2)
})

test('shuffleOrder is a permutation', () => {
  const order = shuffleOrder(5, () => 0.5)
  assert.equal(order.length, 5)
  assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4])
})
