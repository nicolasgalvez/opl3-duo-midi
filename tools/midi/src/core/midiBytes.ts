import type {
  MidiMessageType,
  MidiMessageData,
  NoteMessage,
  CcMessage,
  ProgramMessage,
  PitchMessage,
  SysexMessage,
} from '../contracts/midi.ts'

// Encodes MIDI messages to raw bytes, matching easymidi's Output.parseMessage
// wire format exactly (so a UDP/network target sees identical bytes to what a
// USB MIDI cable would carry). Kept independent of easymidi so it can encode
// for a non-easymidi transport (UDP) with no native binding.

const CHANNEL_TYPES: Record<string, number | undefined> = {
  noteoff: 0x8,
  noteon: 0x9,
  cc: 0xb,
  program: 0xc,
  pitch: 0xe,
}

export function encodeMidiMessage(type: MidiMessageType, args: MidiMessageData): number[] {
  const bytes: number[] = []

  const statusNibble = CHANNEL_TYPES[type]
  if (statusNibble !== undefined) {
    bytes.push((statusNibble << 4) + ((args as { channel?: number }).channel || 0))
  } else if (type === 'sysex') {
    bytes.push(0xf0)
  } else {
    throw new Error(`Unknown MIDI message type: ${String(type)}`)
  }

  switch (type) {
    case 'noteoff':
    case 'noteon': {
      const note = args as NoteMessage
      bytes.push(note.note, note.velocity)
      break
    }
    case 'cc': {
      const cc = args as CcMessage
      bytes.push(cc.controller, cc.value)
      break
    }
    case 'program':
      bytes.push((args as ProgramMessage).number)
      break
    case 'pitch': {
      const value = (args as PitchMessage).value
      bytes.push(value & 0x7f, (value & 0x3f80) >> 7)
      break
    }
    case 'sysex': {
      const sysex = args as SysexMessage
      if (sysex.length <= 3 || sysex[0] !== 0xf0 || sysex[sysex.length - 1] !== 0xf7) {
        throw new Error('sysex commands should be an array that starts with 0xf0 and ends with 0xf7')
      }
      for (const b of sysex.slice(1)) bytes.push(b)
      break
    }
  }

  return bytes
}
