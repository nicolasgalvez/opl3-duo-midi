import { DEFAULT_MIDI_UDP_PORT } from './udpMidiOutput.mjs'

// Resolves a --host/--net-port CLI target (or its OPL_MIDI_HOST/OPL_MIDI_PORT
// env fallbacks) into { host, port }, or null when no network target was
// requested — the caller should fall back to USB in that case.
export function resolveNetTarget(argv, env = process.env) {
  const host = argv.host || env.OPL_MIDI_HOST
  if (!host) return null
  const port = Number(argv.netPort || env.OPL_MIDI_PORT || DEFAULT_MIDI_UDP_PORT)
  return { host, port }
}
