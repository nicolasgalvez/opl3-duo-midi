import easymidi from 'easymidi'

import type { MidiMessageType, MidiMessageData } from '../../contracts/midi.ts'
import type { ClosableMidiOutput } from '../../ports/midiOutput.ts'

// MIDI output enumeration that never throws: on a host with no MIDI subsystem
// (e.g. a CI runner, or a headless box with no ALSA sequencer) easymidi throws,
// which must not crash `opl serve` — the visualizer / SoundFont output still work.
export function midiOutputs(): string[] {
  try {
    return easymidi.getOutputs()
  } catch {
    return []
  }
}

// Wraps easymidi.Output behind the MidiOutput port. easymidi types send() as
// one overload per message type, which a union-typed port call can't satisfy
// structurally — this adapter concentrates that one loose cast in one place.
export class EasymidiOutput implements ClosableMidiOutput {
  readonly name: string
  #out: easymidi.Output

  constructor(name: string) {
    this.name = name
    this.#out = new easymidi.Output(name)
  }

  send(type: MidiMessageType, data?: MidiMessageData): void {
    ;(this.#out.send as (type: string, data?: unknown) => void)(type, data)
  }

  close(): void {
    this.#out.close()
  }
}

export function openUsbOutput(name: string): ClosableMidiOutput {
  return new EasymidiOutput(name)
}
