import { resolveNetTarget } from '../core/deviceTarget.ts'
import { buildAllNotesOffMessages, sendMessages } from '../core/midiReset.ts'
import { midiOutputs, openUsbOutput } from '../adapters/midi/outputs.ts'
import { UdpMidiOutput } from '../adapters/net/udpMidiOutput.ts'
import type { MidiOutput, ClosableMidiOutput } from '../ports/midiOutput.ts'

export const DEFAULT_PORT_MATCH = 'OPL3Duo'

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Options every `opl` command inherits (registered at the top yargs level). */
export interface GlobalArgv {
  device?: string
  port?: string
  host?: string
  netPort?: number
}

export type PortPick = { ok: true; name: string; fallback: boolean } | { ok: false; reason: 'no-ports' | 'no-match' }

/** Pure port-selection policy: explicit request > default match > first port (flagged). */
export function pickPort(requested: string | undefined, names: string[]): PortPick {
  if (names.length === 0) return { ok: false, reason: 'no-ports' }
  const match = (requested || DEFAULT_PORT_MATCH).toLowerCase()
  const found = names.find((n) => n.toLowerCase().includes(match))
  if (found) return { ok: true, name: found, fallback: false }
  if (requested) return { ok: false, reason: 'no-match' }
  return { ok: true, name: names[0]!, fallback: true }
}

export function resolvePort(requested?: string): string {
  const names = midiOutputs()
  const pick = pickPort(requested, names)
  if (!pick.ok) {
    console.error(
      pick.reason === 'no-ports'
        ? 'No MIDI output ports found. Is the Teensy plugged in and flashed?'
        : `No output matching "${requested}". Available: ${names.join(', ')}`,
    )
    process.exit(1)
  }
  if (pick.fallback) {
    console.error(`warning: no port matching "${DEFAULT_PORT_MATCH}"; using "${pick.name}" (--device <name> to pick)`)
  }
  return pick.name
}

export function openOutput(argv: GlobalArgv): { out: ClosableMidiOutput; name: string } {
  const net = resolveNetTarget(argv)
  if (net) return { out: new UdpMidiOutput(net.host, net.port), name: `net://${net.host}:${net.port}` }
  const name = resolvePort(argv.device ?? argv.port)
  return { out: openUsbOutput(name), name }
}

export function allNotesOff(out: MidiOutput): void {
  sendMessages(out, buildAllNotesOffMessages())
}
