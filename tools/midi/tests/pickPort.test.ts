import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickPort, DEFAULT_PORT_MATCH } from '../src/cli/shared.ts'

const PORTS = ['ESP32-S3 USB MIDI GPIO Bridge', 'OPL3Duo MIDI', 'FluidSynth virtual port (123)']

test('pickPort finds the default OPL3Duo port when no device is requested', () => {
  assert.deepEqual(pickPort(undefined, PORTS), { ok: true, name: 'OPL3Duo MIDI', fallback: false })
})

test('pickPort matches a requested device case-insensitively by substring', () => {
  assert.deepEqual(pickPort('fluid', PORTS), { ok: true, name: 'FluidSynth virtual port (123)', fallback: false })
  assert.deepEqual(pickPort('esp32', PORTS), { ok: true, name: 'ESP32-S3 USB MIDI GPIO Bridge', fallback: false })
})

test('pickPort errors when an explicitly requested device matches nothing', () => {
  assert.deepEqual(pickPort('nosuch', PORTS), { ok: false, reason: 'no-match' })
})

test('pickPort falls back to the first port when the default match misses — flagged so the CLI can warn', () => {
  const ports = ['ESP32-S3 USB MIDI GPIO Bridge', 'Some Other Synth']
  assert.deepEqual(pickPort(undefined, ports), {
    ok: true,
    name: 'ESP32-S3 USB MIDI GPIO Bridge',
    fallback: true,
  })
})

test('pickPort errors when no ports exist at all', () => {
  assert.deepEqual(pickPort(undefined, []), { ok: false, reason: 'no-ports' })
  assert.deepEqual(pickPort('anything', []), { ok: false, reason: 'no-ports' })
})

test('DEFAULT_PORT_MATCH is the OPL3Duo', () => {
  assert.equal(DEFAULT_PORT_MATCH, 'OPL3Duo')
})
