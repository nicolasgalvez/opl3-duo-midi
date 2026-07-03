import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVgmHeader, resolveChip, parseVgmCommands, parseVgm, toFlatEvents } from '../src/core/vgm.ts'
import { rawWriteSysEx, bankForPort } from '../src/core/oplRaw.ts'

const SAMPLE_RATE = 44100

// Hand-built minimal VGM buffers — no real VGMRips file is needed for unit tests.
// Layout: https://vgmrips.net/wiki/VGM_Specification

function u32(buf, off, value) {
  buf.writeUInt32LE(value >>> 0, off)
}

// Builds a v1.51-style header (data offset + OPL clock fields both present,
// data starts immediately after the header) followed by a raw command stream.
function buildVgm({ totalSamples = 0, loopOffsetAbs = 0, ym3812Clock = 0, ymf262Clock = 0, commands = [] } = {}) {
  const header = Buffer.alloc(0x60)
  header.write('Vgm ', 0, 'ascii')
  u32(header, 0x08, 0x151)
  u32(header, 0x18, totalSamples)
  u32(header, 0x1c, loopOffsetAbs ? loopOffsetAbs - 0x1c : 0)
  u32(header, 0x34, header.length - 0x34) // data starts right after the header
  u32(header, 0x50, ym3812Clock)
  u32(header, 0x5c, ymf262Clock)
  return Buffer.concat([header, Buffer.from(commands)])
}

function write5A(reg, val) {
  return [0x5a, reg, val]
}
function write5E(reg, val) {
  return [0x5e, reg, val]
}
function write5F(reg, val) {
  return [0x5f, reg, val]
}
function wait16(n) {
  return [0x61, n & 0xff, (n >> 8) & 0xff]
}
function end() {
  return [0x66]
}

test('parseVgmHeader: v1.51+ reads version, samples, data offset (relative to 0x34), clocks', () => {
  const buf = buildVgm({ totalSamples: 88200, ym3812Clock: 3579545, commands: [...end()] })
  const header = parseVgmHeader(buf)
  assert.equal(header.version, 0x151)
  assert.equal(header.totalSamples, 88200)
  assert.equal(header.dataOffset, 0x60)
  assert.equal(header.ym3812Clock, 3579545)
  assert.equal(header.ymf262Clock, 0)
})

test('parseVgmHeader: older versions (< v1.50) fall back to a fixed 0x40 data start', () => {
  const buf = Buffer.alloc(0x40)
  buf.write('Vgm ', 0, 'ascii')
  u32(buf, 0x08, 0x100)
  const header = parseVgmHeader(buf)
  assert.equal(header.dataOffset, 0x40)
})

test('parseVgmHeader: a zero loop-offset field means "no loop"', () => {
  const buf = buildVgm({ commands: [...end()] })
  assert.equal(parseVgmHeader(buf).loopOffset, 0)
})

test('parseVgmHeader: a non-zero loop-offset field resolves to an absolute offset', () => {
  const buf = buildVgm({ loopOffsetAbs: 0x70, commands: [...end()] })
  assert.equal(parseVgmHeader(buf).loopOffset, 0x70)
})

test('parseVgmHeader: rejects a buffer without the "Vgm " magic', () => {
  assert.throws(() => parseVgmHeader(Buffer.from('nope')), /Vgm /)
})

test('resolveChip: YM3812-only header resolves to ym3812', () => {
  const header = parseVgmHeader(buildVgm({ ym3812Clock: 3579545, commands: [...end()] }))
  assert.deepEqual(resolveChip(header), { chip: 'ym3812', clock: 3579545 })
})

test('resolveChip: YMF262-only header resolves to ymf262', () => {
  const header = parseVgmHeader(buildVgm({ ymf262Clock: 14318180, commands: [...end()] }))
  assert.deepEqual(resolveChip(header), { chip: 'ymf262', clock: 14318180 })
})

test('resolveChip: prefers ymf262 (the OPL3 superset) when both clocks are present', () => {
  const header = parseVgmHeader(buildVgm({ ym3812Clock: 3579545, ymf262Clock: 14318180, commands: [...end()] }))
  assert.equal(resolveChip(header).chip, 'ymf262')
})

test('resolveChip: no OPL clock present throws a clear, actionable error', () => {
  const header = parseVgmHeader(buildVgm({ commands: [...end()] }))
  assert.throws(() => resolveChip(header), /YM3812|YMF262|OPL/)
})

test('parseVgmCommands: OPL2 (0x5A) writes are timestamped by preceding waits', () => {
  const buf = buildVgm({
    ym3812Clock: 3579545,
    commands: [...write5A(0xb0, 0x20), ...wait16(100), ...write5A(0xb0, 0x00), ...end()],
  })
  const header = parseVgmHeader(buf)
  const { writes } = parseVgmCommands(buf, header)
  assert.deepEqual(writes, [
    { t: 0, port: 0, reg: 0xb0, value: 0x20 },
    { t: 100 / SAMPLE_RATE, port: 0, reg: 0xb0, value: 0x00 },
  ])
})

test('parseVgmCommands: YMF262 port 0 (0x5E) and port 1 (0x5F) writes are distinguished', () => {
  const buf = buildVgm({
    ymf262Clock: 14318180,
    commands: [...write5E(0x05, 0x01), ...write5F(0x01, 0x02), ...end()],
  })
  const header = parseVgmHeader(buf)
  const { writes } = parseVgmCommands(buf, header)
  assert.deepEqual(
    writes.map((w) => w.port),
    [0, 1],
  )
})

test('parseVgmCommands: all four wait forms advance time correctly (735 / 882 / n+1 / 16-bit)', () => {
  const buf = buildVgm({
    ym3812Clock: 3579545,
    commands: [
      ...write5A(0x00, 0x00), // t=0
      0x62, // wait 735
      ...write5A(0x01, 0x00), // t=735
      0x63, // wait 882
      ...write5A(0x02, 0x00), // t=735+882
      0x74, // wait (0x74 & 0x0f) + 1 = 5
      ...write5A(0x03, 0x00), // t=735+882+5
      ...wait16(10),
      ...write5A(0x04, 0x00), // t=735+882+5+10
      ...end(),
    ],
  })
  const header = parseVgmHeader(buf)
  const { writes } = parseVgmCommands(buf, header)
  const times = writes.map((w) => w.t * SAMPLE_RATE)
  assert.deepEqual(times, [0, 735, 735 + 882, 735 + 882 + 5, 735 + 882 + 5 + 10])
})

test('parseVgmCommands: duration prefers the header total-samples field over the running total', () => {
  const buf = buildVgm({ ym3812Clock: 3579545, totalSamples: 999, commands: [...wait16(10), ...end()] })
  const header = parseVgmHeader(buf)
  const { duration } = parseVgmCommands(buf, header)
  assert.equal(duration, 999 / SAMPLE_RATE)
})

test('parseVgmCommands: an unsupported command throws a clear error (catches combo-chip files too)', () => {
  const buf = buildVgm({ ym3812Clock: 3579545, commands: [0x50, 0x00, ...end()] }) // 0x50 = SN76489 PSG write
  const header = parseVgmHeader(buf)
  assert.throws(() => parseVgmCommands(buf, header), /0x50/)
})

test('parseVgm: happy path returns chip, writes, duration', () => {
  const buf = buildVgm({
    ym3812Clock: 3579545,
    totalSamples: 100,
    commands: [...write5A(0xb0, 0x20), ...end()],
  })
  const vgm = parseVgm(buf)
  assert.equal(vgm.chip, 'ym3812')
  assert.equal(vgm.duration, 100 / SAMPLE_RATE)
  // The file's own write is last, after the bare-OPL2 chip init writes.
  assert.deepEqual(vgm.writes.at(-1), { t: 0, port: 0, reg: 0xb0, value: 0x20 })
})

test('parseVgm: prepends writes that reset the chip to a bare-OPL2 baseline (OPL3 mode + 4-op pairing off)', () => {
  // Our firmware's GM engine leaves the chip in OPL3+4-op-enabled mode, which
  // corrupts VGM playback unless explicitly cleared before replay (confirmed
  // via hardware smoke test).
  const buf = buildVgm({ ym3812Clock: 3579545, commands: [...end()] })
  const vgm = parseVgm(buf)
  assert.deepEqual(vgm.writes, [
    { t: 0, port: 1, reg: 0x04, value: 0x00 },
    { t: 0, port: 1, reg: 0x05, value: 0x00 },
  ])
})

test('parseVgm: fails fast on a non-OPL file before ever touching the command stream', () => {
  // Garbage command bytes after the header — would blow up parseVgmCommands if reached.
  const buf = buildVgm({ commands: [0xff, 0xff, 0xff] })
  assert.throws(() => parseVgm(buf), /YM3812|YMF262|OPL/)
})

test('toFlatEvents: maps writes to raw SysEx events using the shared oplRaw encoder, keeping port/reg/value for the visualizer', () => {
  const vgm = {
    duration: 1,
    writes: [
      { t: 0, port: 0, reg: 0xb0, value: 0x20 },
      { t: 0.5, port: 1, reg: 0x01, value: 0x02 },
    ],
  }
  assert.deepEqual(toFlatEvents(vgm), [
    { t: 0, k: 'raw', port: 0, reg: 0xb0, value: 0x20, bytes: rawWriteSysEx(bankForPort(0), 0xb0, 0x20) },
    { t: 0.5, k: 'raw', port: 1, reg: 0x01, value: 0x02, bytes: rawWriteSysEx(bankForPort(1), 0x01, 0x02) },
  ])
})
