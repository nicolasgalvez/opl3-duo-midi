import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RENDER_OPTIONS, extractRenderArgs, serializeRenderArgs } from '../lib/renderOptions.mjs'

test('RENDER_OPTIONS covers the documented render flags', () => {
  const flags = RENDER_OPTIONS.map((o) => o.flag)
  for (const f of ['album', 'obs', 'obs-source', 'host', 'net-port', 'audio-device', 'output', 'ratio', 'tail']) {
    assert.ok(flags.includes(f), `missing flag: ${f}`)
  }
})

test('extractRenderArgs picks only known render options out of a parsed argv', () => {
  const argv = {
    _: ['render'],
    $0: 'opl',
    paths: ['song.mid'],
    album: true,
    obs: false,
    host: '192.168.1.121',
    bogus: 'nope',
  }
  const extracted = extractRenderArgs(argv)
  assert.deepEqual(extracted, { album: true, obs: false, host: '192.168.1.121' })
})

test('extractRenderArgs omits undefined/unset options', () => {
  const argv = { _: [], $0: 'opl', album: true }
  const extracted = extractRenderArgs(argv)
  assert.deepEqual(extracted, { album: true })
})

test('serializeRenderArgs turns boolean true into a bare flag', () => {
  assert.deepEqual(serializeRenderArgs({ album: true, obs: true }), ['--album', '--obs'])
})

test('serializeRenderArgs omits boolean false (flag not passed)', () => {
  assert.deepEqual(serializeRenderArgs({ album: false }), [])
})

test('serializeRenderArgs pairs string/number options with their value', () => {
  assert.deepEqual(serializeRenderArgs({ host: '192.168.1.121', tail: 5 }), ['--host', '192.168.1.121', '--tail', '5'])
})

test('serializeRenderArgs kebab-cases camelCase keys back to CLI flag form', () => {
  assert.deepEqual(serializeRenderArgs({ audioDevice: 'Clarett 4Pre', obsSource: 'Browser 2' }), [
    '--audio-device',
    'Clarett 4Pre',
    '--obs-source',
    'Browser 2',
  ])
})

test('extractRenderArgs + serializeRenderArgs round-trip a realistic queue job', () => {
  const argv = {
    _: ['queue', 'add'],
    $0: 'opl',
    paths: ['folder'],
    album: true,
    obs: true,
    obsSource: 'Browser 2',
    host: '192.168.1.121',
    netPort: 1999,
    output: 'out.mp4',
  }
  const flags = serializeRenderArgs(extractRenderArgs(argv))
  // Order of flags isn't semantically meaningful for a CLI invocation -- assert as pairs.
  const pairs = new Set()
  for (let i = 0; i < flags.length; ) {
    if (flags[i + 1]?.startsWith('--')) {
      pairs.add(flags[i])
      i += 1
    } else {
      pairs.add(`${flags[i]} ${flags[i + 1]}`)
      i += 2
    }
  }
  assert.deepEqual(
    pairs,
    new Set([
      '--album',
      '--obs',
      '--obs-source Browser 2',
      '--host 192.168.1.121',
      '--net-port 1999',
      '--output out.mp4',
    ]),
  )
})
