import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { validateConfig, presetConfig } from '../src/contracts/config.ts'
import { loadConfigFile } from '../src/adapters/fs/config.ts'

test('validateConfig fills defaults (full feature set)', () => {
  const c = validateConfig({})
  assert.equal(c.theme, 'green')
  assert.equal(c.layout, 'normal')
  assert.equal(c.output, 'hardware')
  assert.equal(c.features.menu, true)
  assert.equal(c.features.library, true)
  assert.equal(c.features.edit, true)
  assert.equal(c.features.devicePicker, true)
  assert.equal(c.features.outputPicker, true)
})

test('validateConfig rejects unknown keys with a clear error', () => {
  assert.throws(() => validateConfig({ bogus: 1 }), /invalid config/)
})

test('validateConfig rejects bad enum values', () => {
  assert.throws(() => validateConfig({ theme: 'pink' }), /invalid config/)
})

test('player-only preset hides menu/library/edit and uses soundfont', () => {
  const c = presetConfig('player-only')
  assert.equal(c.features.menu, false)
  assert.equal(c.features.library, false)
  assert.equal(c.features.edit, false)
  assert.equal(c.features.outputPicker, false)
  assert.equal(c.output, 'soundfont')
  assert.equal(c.features.playlist, true) // a player still shows its playlist
})

test('presetConfig throws on an unknown preset', () => {
  assert.throws(() => presetConfig('nope'), /unknown preset/)
})

test('loadConfigFile reads + validates JSON; a `preset` field is extended', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opl-cfg-'))
  try {
    const f = join(dir, 'c.json')
    writeFileSync(f, JSON.stringify({ preset: 'player-only', title: 'Embed Me' }))
    const c = loadConfigFile(f)
    assert.equal(c.title, 'Embed Me') // override applied
    assert.equal(c.features.menu, false) // inherited from preset
    assert.equal(c.output, 'soundfont')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadConfigFile throws clear errors for a missing file and bad JSON', () => {
  assert.throws(() => loadConfigFile('/no/such/file.json'), /not found/)
  const dir = mkdtempSync(join(tmpdir(), 'opl-cfg-'))
  try {
    const f = join(dir, 'bad.json')
    writeFileSync(f, '{ not json')
    assert.throws(() => loadConfigFile(f), /not valid JSON/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
