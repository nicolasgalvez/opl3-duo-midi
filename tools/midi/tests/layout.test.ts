import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLayout } from '../src/core/layout.ts'

test('resolveLayout defaults to normal', () => {
  assert.equal(resolveLayout({}, {}), 'normal')
})

test('resolveLayout reads --layout flag', () => {
  assert.equal(resolveLayout({ layout: 'minimized' }, {}), 'minimized')
  assert.equal(resolveLayout({ layout: 'overlay' }, {}), 'overlay')
})

test('resolveLayout reads OPL_LAYOUT env', () => {
  assert.equal(resolveLayout({}, { OPL_LAYOUT: 'minimized' }), 'minimized')
  assert.equal(resolveLayout({}, { OPL_LAYOUT: 'overlay' }), 'overlay')
})

test('resolveLayout flag overrides env', () => {
  assert.equal(resolveLayout({ layout: 'overlay' }, { OPL_LAYOUT: 'minimized' }), 'overlay')
})

test('resolveLayout rejects unknown values', () => {
  assert.throws(() => resolveLayout({ layout: 'fullscreen' }, {}), /unknown layout/i)
})
