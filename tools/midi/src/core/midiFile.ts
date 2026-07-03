function fourCc(buf: Buffer, offset: number): string {
  return buf.subarray(offset, offset + 4).toString('ascii')
}

function unwrapRmid(buf: Buffer, path?: string): Buffer {
  if (buf.length < 12) {
    throw new Error(`Bad MIDI file${path ? ` ${path}` : ''}. RIFF header is incomplete.`)
  }

  const form = fourCc(buf, 8)
  if (form !== 'RMID') {
    throw new Error(`Bad MIDI file${path ? ` ${path}` : ''}. RIFF ${form} is not a RIFF MIDI file.`)
  }

  let offset = 12
  while (offset + 8 <= buf.length) {
    const id = fourCc(buf, offset)
    const size = buf.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    const dataEnd = dataStart + size

    if (dataEnd > buf.length) {
      throw new Error(`Bad MIDI file${path ? ` ${path}` : ''}. RIFF chunk ${id} extends past end of file.`)
    }

    if (id === 'data') {
      const data = buf.subarray(dataStart, dataEnd)
      if (fourCc(data, 0) !== 'MThd') {
        throw new Error(`Bad MIDI file${path ? ` ${path}` : ''}. RIFF RMID data chunk does not contain MThd.`)
      }
      return data
    }

    offset = dataEnd + (size % 2)
  }

  throw new Error(`Bad MIDI file${path ? ` ${path}` : ''}. RIFF RMID has no data chunk.`)
}

/** Extract the standard-MIDI-file bytes from an already-read buffer (unwrapping RIFF RMID if needed). */
export function extractMidiBuffer(buf: Buffer, path?: string): Buffer {
  if (fourCc(buf, 0) === 'MThd') return buf
  if (fourCc(buf, 0) === 'RIFF') return unwrapRmid(buf, path)

  throw new Error(`Bad MIDI file ${path}. Expected MThd or RIFF RMID, got: ${fourCc(buf, 0)}`)
}
