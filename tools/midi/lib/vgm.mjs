import { rawWriteSysEx, bankForPort } from './oplRaw.mjs'

// VGM (native OPL2/OPL3 register-log) parsing. Spec: https://vgmrips.net/wiki/VGM_Specification
// Only the OPL family is supported (YM3812/OPL2, YMF262/OPL3) — everything
// else (PSG, FM chips outside the OPL family, samplers, ...) is out of scope.

const SAMPLE_RATE = 44100

const OFF = {
  VERSION: 0x08,
  TOTAL_SAMPLES: 0x18,
  LOOP_OFFSET: 0x1c,
  DATA_OFFSET: 0x34,
  YM3812_CLOCK: 0x50,
  YMF262_CLOCK: 0x5c,
}

function readU32LE(buf, off) {
  return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0
}

export function isVgm(buf) {
  return buf.length >= 4 && buf.toString('ascii', 0, 4) === 'Vgm '
}

/** Parse the fixed VGM header into the fields we need. */
export function parseVgmHeader(buf) {
  if (!isVgm(buf)) throw new Error('Not a VGM file (missing "Vgm " magic)')

  const version = readU32LE(buf, OFF.VERSION)
  const dataOffset = version >= 0x150 ? OFF.DATA_OFFSET + readU32LE(buf, OFF.DATA_OFFSET) : 0x40
  const loopOffsetRaw = readU32LE(buf, OFF.LOOP_OFFSET)

  return {
    version,
    dataOffset,
    loopOffset: loopOffsetRaw ? OFF.LOOP_OFFSET + loopOffsetRaw : 0,
    totalSamples: readU32LE(buf, OFF.TOTAL_SAMPLES),
    ym3812Clock: readU32LE(buf, OFF.YM3812_CLOCK),
    ymf262Clock: readU32LE(buf, OFF.YMF262_CLOCK),
  }
}

/** Resolve the OPL chip this VGM targets, or throw a clear error if it isn't one. */
export function resolveChip(header) {
  if (header.ymf262Clock) return { chip: 'ymf262', clock: header.ymf262Clock }
  if (header.ym3812Clock) return { chip: 'ym3812', clock: header.ym3812Clock }
  throw new Error(
    'Unsupported VGM: no YM3812 (OPL2) or YMF262 (OPL3) chip clock found in the header — ' +
      'this file targets a different sound chip and cannot play on the OPL3 Duo.',
  )
}

/** Walk the VGM command stream into a flat, time-resolved list of register writes. */
export function parseVgmCommands(buf, header) {
  const writes = []
  let offset = header.dataOffset
  let samples = 0

  const pushWrite = (port, reg, value) => writes.push({ t: samples / SAMPLE_RATE, port, reg, value })

  while (offset < buf.length) {
    const cmd = buf[offset++]
    switch (cmd) {
      case 0x5a: // YM3812 (OPL2) register write
        pushWrite(0, buf[offset], buf[offset + 1])
        offset += 2
        break
      case 0x5e: // YMF262 (OPL3) port 0 register write
        pushWrite(0, buf[offset], buf[offset + 1])
        offset += 2
        break
      case 0x5f: // YMF262 (OPL3) port 1 register write
        pushWrite(1, buf[offset], buf[offset + 1])
        offset += 2
        break
      case 0x61: // wait n samples (16-bit LE)
        samples += buf.readUInt16LE(offset)
        offset += 2
        break
      case 0x62: // wait 735 samples (1/60s, NTSC frame)
        samples += 735
        break
      case 0x63: // wait 882 samples (1/50s, PAL frame)
        samples += 882
        break
      case 0x66: // end of sound data
        offset = buf.length
        break
      default:
        if (cmd >= 0x70 && cmd <= 0x7f) {
          samples += (cmd & 0x0f) + 1
          break
        }
        throw new Error(
          `Unsupported VGM command 0x${cmd.toString(16)} at offset 0x${(offset - 1).toString(16)} ` +
            '(only OPL2/OPL3 register writes are supported — this file likely also drives another chip).',
        )
    }
  }

  return { writes, duration: (header.totalSamples || samples) / SAMPLE_RATE }
}

/** Parse a VGM file buffer end to end. Throws early for non-OPL chips. */
export function parseVgm(buf) {
  const header = parseVgmHeader(buf)
  const { chip } = resolveChip(header) // throws before touching the (possibly unsupported) command stream
  const { writes, duration } = parseVgmCommands(buf, header)
  return { chip, writes: [...BARE_CHIP_INIT_WRITES, ...writes], duration }
}

// Real OPL2/OPL3 hardware powers on with OPL3 mode and 4-op channel pairing
// both off, and VGM captures assume that starting state. Our firmware's GM
// engine leaves the chip in OPL3+4-op-enabled mode instead (see
// OplSynth::systemReset), which silently corrupts playback if left as-is: an
// OPL2 VGM's 2-op channel writes land on half of a paired 4-op voice instead
// of an independent 2-op channel and produce no audible output (confirmed via
// hardware smoke test — a hand-written OPL2 tone was inaudible until these two
// writes were sent first). Both registers live on register port 1 (0x104/0x105
// in chip terms), matching how a real OPL3 VGM enables OPL3 mode itself via a
// 0x5F write to reg 0x05.
const BARE_CHIP_INIT_WRITES = [
  { t: 0, port: 1, reg: 0x04, value: 0x00 }, // disable all 4-op channel pairs
  { t: 0, port: 1, reg: 0x05, value: 0x00 }, // disable OPL3 mode
]

/** Adapt parsed VGM writes into the flat {t,k,...} event shape the Engine/serve path uses. */
export function toFlatEvents(vgm) {
  return vgm.writes.map(({ t, port, reg, value }) => ({
    t,
    k: 'raw',
    bytes: rawWriteSysEx(bankForPort(port), reg, value),
  }))
}
