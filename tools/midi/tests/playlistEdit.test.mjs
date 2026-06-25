import { test } from 'node:test'
import assert from 'node:assert/strict'

import { removeTrack, moveTrack } from '../lib/playlistEdit.mjs'

const A = ['A', 'B', 'C', 'D']

test('removeTrack drops the item and shifts current when removing before it', () => {
  const r = removeTrack(A, 2, 0) // remove A while C is current
  assert.deepEqual(r.items, ['B', 'C', 'D'])
  assert.equal(r.current, 1) // C moved from 2 -> 1
})

test('removeTrack keeps current when removing after it', () => {
  const r = removeTrack(A, 1, 3) // remove D while B is current
  assert.deepEqual(r.items, ['A', 'B', 'C'])
  assert.equal(r.current, 1)
})

test('removeTrack clamps current when the current item is removed at the end', () => {
  const r = removeTrack(A, 3, 3) // remove D which is current
  assert.deepEqual(r.items, ['A', 'B', 'C'])
  assert.equal(r.current, 2)
})

test('removeTrack yields current -1 when the list becomes empty', () => {
  const r = removeTrack(['A'], 0, 0)
  assert.deepEqual(r.items, [])
  assert.equal(r.current, -1)
})

test('removeTrack is a no-op for out-of-range index', () => {
  const r = removeTrack(A, 1, 9)
  assert.deepEqual(r.items, A)
  assert.equal(r.current, 1)
})

test('moveTrack moving the current item updates current to the destination', () => {
  const r = moveTrack(A, 2, 2, 0) // move C (current) to front
  assert.deepEqual(r.items, ['C', 'A', 'B', 'D'])
  assert.equal(r.current, 0)
})

test('moveTrack moving an earlier item past current shifts current back', () => {
  const r = moveTrack(A, 2, 0, 3) // move A to end; C should follow to index 1
  assert.deepEqual(r.items, ['B', 'C', 'D', 'A'])
  assert.equal(r.current, 1)
})

test('moveTrack moving a later item before current shifts current forward', () => {
  const r = moveTrack(A, 1, 2, 0) // move C before B(current)
  assert.deepEqual(r.items, ['C', 'A', 'B', 'D'])
  assert.equal(r.current, 2)
})

test('moveTrack is a no-op for equal or out-of-range indices', () => {
  assert.deepEqual(moveTrack(A, 1, 2, 2).items, A)
  assert.deepEqual(moveTrack(A, 1, -1, 2).items, A)
})
