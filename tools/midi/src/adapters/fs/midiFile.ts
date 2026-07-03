import { readFileSync } from 'node:fs'

import { extractMidiBuffer } from '../../core/midiFile.ts'

/** Read a MIDI file from disk, unwrapping RIFF RMID containers if needed. */
export function readMidiData(path: string): Buffer {
  return extractMidiBuffer(readFileSync(path), path)
}
