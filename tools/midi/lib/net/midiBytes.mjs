// Encodes MIDI messages to raw bytes, matching easymidi's Output.parseMessage
// wire format exactly (so a UDP/network target sees identical bytes to what a
// USB MIDI cable would carry). Kept independent of easymidi so it can encode
// for a non-easymidi transport (UDP) with no native binding.

const CHANNEL_TYPES = {
  noteoff: 0x8,
  noteon: 0x9,
  cc: 0xb,
  program: 0xc,
  pitch: 0xe,
}

export function encodeMidiMessage(type, args) {
  const bytes = []

  if (CHANNEL_TYPES[type] !== undefined) {
    bytes.push((CHANNEL_TYPES[type] << 4) + (args.channel || 0))
  } else if (type === 'sysex') {
    bytes.push(0xf0)
  } else {
    throw new Error(`Unknown MIDI message type: ${type}`)
  }

  switch (type) {
    case 'noteoff':
    case 'noteon':
      bytes.push(args.note, args.velocity)
      break
    case 'cc':
      bytes.push(args.controller, args.value)
      break
    case 'program':
      bytes.push(args.number)
      break
    case 'pitch':
      bytes.push(args.value & 0x7f, (args.value & 0x3f80) >> 7)
      break
    case 'sysex':
      if (args.length <= 3 || args[0] !== 0xf0 || args[args.length - 1] !== 0xf7) {
        throw new Error('sysex commands should be an array that starts with 0xf0 and ends with 0xf7')
      }
      args.slice(1).forEach((b) => bytes.push(b))
      break
  }

  return bytes
}
