import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { readMidiData } from '../src/adapters/fs/midiFile.ts'

function riffRmid(smf: Buffer) {
  const dataSize = smf.length
  const riffSize = 4 + 8 + dataSize + (dataSize % 2)
  const header = Buffer.alloc(20)
  header.write('RIFF', 0)
  header.writeUInt32LE(riffSize, 4)
  header.write('RMID', 8)
  header.write('data', 12)
  header.writeUInt32LE(dataSize, 16)
  return Buffer.concat([header, smf, dataSize % 2 ? Buffer.from([0]) : Buffer.alloc(0)])
}

test('readMidiData returns plain standard MIDI files unchanged', () => {
  const smf = Buffer.from('MThd0000', 'ascii')
  const dir = mkdtempSync(join(os.tmpdir(), 'opl-midi-'))
  const file = join(dir, 'plain.mid')
  writeFileSync(file, smf)

  assert.deepEqual(readMidiData(file), smf)
})

test('readMidiData unwraps RIFF RMID files', () => {
  const smf = Buffer.from('MThd0000', 'ascii')
  const dir = mkdtempSync(join(os.tmpdir(), 'opl-midi-'))
  const file = join(dir, 'wrapped.mid')
  writeFileSync(file, riffRmid(smf))

  assert.deepEqual(readMidiData(file), smf)
})

test('readMidiData rejects non-MIDI RIFF files with a useful message', () => {
  const wav = Buffer.alloc(12)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(4, 4)
  wav.write('WAVE', 8)
  const dir = mkdtempSync(join(os.tmpdir(), 'opl-midi-'))
  const file = join(dir, 'audio.wav')
  writeFileSync(file, wav)

  assert.throws(() => readMidiData(file), /RIFF WAVE is not a RIFF MIDI file/)
})
