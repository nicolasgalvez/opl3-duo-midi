import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rawWriteSysEx, bankForPort } from '../lib/oplRaw.mjs'

// Raw OPL2/OPL3 register-write SysEx for the OPL3 Duo's own firmware (ODM-15).
// F0 7D 7F <bank> <regHiNibble> <regLoNibble> <valHiNibble> <valLoNibble> F7
// 0x7D is MIDI's non-commercial/educational manufacturer ID (also used by the
// unrelated mt32-pi protocol in lib/net/mt32pi.mjs — different target device,
// disambiguated here by the 0x7F sub-command byte).

test('rawWriteSysEx: F0 7D 7F <bank> <reg nibbles> <value nibbles> F7', () => {
  assert.deepEqual(rawWriteSysEx(0, 0x00, 0x00), [0xf0, 0x7d, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf7])
  assert.deepEqual(rawWriteSysEx(0, 0xb0, 0x20), [0xf0, 0x7d, 0x7f, 0x00, 0x0b, 0x00, 0x02, 0x00, 0xf7])
  assert.deepEqual(rawWriteSysEx(1, 0xff, 0xff), [0xf0, 0x7d, 0x7f, 0x01, 0x0f, 0x0f, 0x0f, 0x0f, 0xf7])
})

test('rawWriteSysEx: every data byte is 7-bit safe', () => {
  const bytes = rawWriteSysEx(3, 0xff, 0xff)
  for (const b of bytes.slice(3, -1)) {
    assert.ok(b >= 0 && b <= 0x7f, `byte ${b} is not 7-bit safe`)
  }
})

test('bankForPort: register port 0/1 on synth unit 0 (default, chip 0 of the Duo)', () => {
  assert.equal(bankForPort(0), 0)
  assert.equal(bankForPort(1), 1)
})

test('bankForPort: register port 0/1 on synth unit 1 (chip 1 of the Duo)', () => {
  assert.equal(bankForPort(0, 1), 2)
  assert.equal(bankForPort(1, 1), 3)
})
