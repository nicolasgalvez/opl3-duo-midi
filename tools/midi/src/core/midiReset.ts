import type { MidiMessage } from '../contracts/midi.ts'
import type { MidiOutput } from '../ports/midiOutput.ts'

const ALL_NOTES_OFF_CCS: [number, number][] = [
  [64, 0], // sustain off
  [120, 0], // all sound off
  [123, 0], // all notes off
]

const CONTROLLER_RESET_CCS: [number, number][] = [
  [120, 0], // all sound off
  [123, 0], // all notes off
  [121, 0], // reset all controllers
  [64, 0], // sustain off
  [1, 0], // mod wheel 0
  [11, 127], // expression max
  [7, 100], // channel volume default
  [10, 64], // pan center
]

function ccMessagesForChannel(ccs: [number, number][], channel: number): MidiMessage[] {
  return ccs.map(([controller, value]): MidiMessage => ({ type: 'cc', data: { controller, value, channel } }))
}

/** Quick silence: sustain off + all sound off + all notes off, per channel. */
export function buildAllNotesOffMessages(): MidiMessage[] {
  const messages: MidiMessage[] = []
  for (let channel = 0; channel < 16; channel++) messages.push(...ccMessagesForChannel(ALL_NOTES_OFF_CCS, channel))
  return messages
}

/** Full GM-style per-channel reset messages: silences notes and resets controller
 *  state (mod wheel, pitch bend, sustain, expression, volume, pan, program) so it
 *  can't bleed from one track into the next in album/playlist mode. */
export function buildControllerResetMessages(): MidiMessage[] {
  const messages: MidiMessage[] = []
  for (let channel = 0; channel < 16; channel++) {
    messages.push(...ccMessagesForChannel(CONTROLLER_RESET_CCS, channel))
    messages.push({ type: 'pitch', data: { value: 8192, channel } })
    messages.push({ type: 'program', data: { number: 0, channel } })
  }
  return messages
}

/** Send a list of {type, data} messages (as built above) to a MIDI output. */
export function sendMessages(out: MidiOutput, messages: MidiMessage[]): void {
  for (const { type, data } of messages) out.send(type, data)
}
