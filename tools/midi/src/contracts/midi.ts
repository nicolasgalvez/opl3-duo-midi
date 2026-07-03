// easymidi-compatible MIDI message shapes, shared by the reset builders (core),
// the byte encoder (core/midiBytes.ts), and every outbound transport adapter.

export interface NoteMessage {
  note: number
  velocity: number
  channel: number
}

export interface CcMessage {
  controller: number
  value: number
  channel: number
}

export interface ProgramMessage {
  number: number
  channel: number
}

export interface PitchMessage {
  value: number
  channel: number
}

/** Raw SysEx bytes, 0xF0 ... 0xF7 inclusive. */
export type SysexMessage = number[]

export type MidiMessage =
  | { type: 'noteon'; data: NoteMessage }
  | { type: 'noteoff'; data: NoteMessage }
  | { type: 'cc'; data: CcMessage }
  | { type: 'program'; data: ProgramMessage }
  | { type: 'pitch'; data: PitchMessage }
  | { type: 'sysex'; data: SysexMessage }
  // MIDI System Reset (0xFF real-time byte); no payload. USB (easymidi)
  // honors it, transports that can't encode it throw — callers treat it as
  // best-effort (see resetToBaseline).
  | { type: 'reset'; data?: undefined }

export type MidiMessageType = MidiMessage['type']
export type MidiMessageData = MidiMessage['data']
