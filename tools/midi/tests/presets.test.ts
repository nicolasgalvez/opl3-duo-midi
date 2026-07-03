import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDimensions } from '../src/core/presets.ts'

test('resolveDimensions legacy ratio 16:9', () => {
  assert.deepEqual(resolveDimensions({ ratio: '16:9' }, {}), { w: 1280, h: 720 })
})

test('resolveDimensions custom resolution wins', () => {
  assert.deepEqual(resolveDimensions({ resolution: '1920x1080', platform: 'youtube', aspect: 'portrait' }, {}), {
    w: 1920,
    h: 1080,
  })
})

test('resolveDimensions youtube landscape', () => {
  assert.deepEqual(resolveDimensions({ platform: 'youtube', aspect: 'landscape' }, {}), { w: 1920, h: 1080 })
})

test('resolveDimensions youtube portrait (Shorts)', () => {
  assert.deepEqual(resolveDimensions({ platform: 'youtube', aspect: 'portrait' }, {}), { w: 1080, h: 1920 })
})

test('resolveDimensions instagram square', () => {
  assert.deepEqual(resolveDimensions({ platform: 'instagram', aspect: 'square' }, {}), { w: 1080, h: 1080 })
})

test('resolveDimensions instagram portrait feed', () => {
  assert.deepEqual(resolveDimensions({ platform: 'instagram', aspect: 'portrait' }, {}), { w: 1080, h: 1350 })
})

test('resolveDimensions instagram story/reels', () => {
  assert.deepEqual(resolveDimensions({ platform: 'instagram', aspect: 'story' }, {}), { w: 1080, h: 1920 })
})

test('resolveDimensions platform env vars', () => {
  assert.deepEqual(resolveDimensions({}, { OPL_PLATFORM: 'youtube', OPL_ASPECT: 'landscape' }), { w: 1920, h: 1080 })
})

test('resolveDimensions rejects invalid platform/aspect combo', () => {
  assert.throws(() => resolveDimensions({ platform: 'youtube', aspect: 'story' }, {}), /unknown/i)
})
