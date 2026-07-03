import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveNetTarget } from '../src/core/deviceTarget.ts'

test('resolveNetTarget returns null when no --host and no env var', () => {
  assert.equal(resolveNetTarget({}, {}), null)
})

test('resolveNetTarget uses --host with the default port', () => {
  assert.deepEqual(resolveNetTarget({ host: '192.168.1.121' }, {}), { host: '192.168.1.121', port: 1999 })
})

test('resolveNetTarget uses --net-port when given', () => {
  assert.deepEqual(resolveNetTarget({ host: '192.168.1.121', netPort: 2000 }, {}), {
    host: '192.168.1.121',
    port: 2000,
  })
})

test('resolveNetTarget falls back to OPL_MIDI_HOST / OPL_MIDI_PORT env vars', () => {
  assert.deepEqual(resolveNetTarget({}, { OPL_MIDI_HOST: '192.168.1.121', OPL_MIDI_PORT: '2000' }), {
    host: '192.168.1.121',
    port: 2000,
  })
})

test('resolveNetTarget prefers --host/--net-port over env vars', () => {
  assert.deepEqual(
    resolveNetTarget({ host: '10.0.0.5', netPort: 3000 }, { OPL_MIDI_HOST: '192.168.1.121', OPL_MIDI_PORT: '2000' }),
    { host: '10.0.0.5', port: 3000 },
  )
})
