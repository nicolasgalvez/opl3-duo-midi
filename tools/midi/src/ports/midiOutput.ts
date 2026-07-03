import type { MidiMessageType, MidiMessageData } from '../contracts/midi.ts'

/**
 * Outbound MIDI sink the core writes through — same `.send(type, args)` shape
 * as easymidi.Output, fulfilled today by USB (easymidi) and UDP
 * (adapters/net/udpMidiOutput.ts) transports.
 */
export interface MidiOutput {
  send(type: MidiMessageType, data?: MidiMessageData): void
}

/** A MidiOutput bound to a real transport that must be released when done. */
export interface ClosableMidiOutput extends MidiOutput {
  readonly name: string
  close(): void
}
