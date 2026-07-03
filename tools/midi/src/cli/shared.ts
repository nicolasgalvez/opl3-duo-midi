import { resolveNetTarget } from '../core/deviceTarget.ts'
import { buildAllNotesOffMessages, sendMessages } from '../core/midiReset.ts'
import { midiOutputs, openUsbOutput } from '../adapters/midi/outputs.ts'
import { UdpMidiOutput } from '../adapters/net/udpMidiOutput.ts'
import type { MidiOutput, ClosableMidiOutput } from '../ports/midiOutput.ts'

export const DEFAULT_PORT_MATCH = 'OPL3Duo'

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Options every `opl` command inherits (registered at the top yargs level). */
export interface GlobalArgv {
  port?: string
  host?: string
  netPort?: number
}

export function resolvePort(requested?: string): string {
  const names = midiOutputs()
  if (names.length === 0) {
    console.error('No MIDI output ports found. Is the Teensy plugged in and flashed?')
    process.exit(1)
  }
  const match = (requested || DEFAULT_PORT_MATCH).toLowerCase()
  const found = names.find((n) => n.toLowerCase().includes(match))
  if (found) return found
  if (requested) {
    console.error(`No output matching "${requested}". Available: ${names.join(', ')}`)
    process.exit(1)
  }
  return names[0]!
}

export function openOutput(argv: GlobalArgv): { out: ClosableMidiOutput; name: string } {
  const net = resolveNetTarget(argv)
  if (net) return { out: new UdpMidiOutput(net.host, net.port), name: `net://${net.host}:${net.port}` }
  const name = resolvePort(argv.port)
  return { out: openUsbOutput(name), name }
}

export function allNotesOff(out: MidiOutput): void {
  sendMessages(out, buildAllNotesOffMessages())
}
