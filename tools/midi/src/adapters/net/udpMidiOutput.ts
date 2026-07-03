import dgram from 'node:dgram'
import { encodeMidiMessage } from '../../core/midiBytes.ts'
import { DEFAULT_MIDI_UDP_PORT } from '../../contracts/net.ts'
import type { MidiMessageType, MidiMessageData } from '../../contracts/midi.ts'
import type { MidiOutput } from '../../ports/midiOutput.ts'

// Drop-in replacement for easymidi.Output (same .send(type, args)/.close()
// shape) that ships raw MIDI bytes over a UDP socket instead of a USB cable.
export class UdpMidiOutput implements MidiOutput {
  readonly host: string
  readonly port: number
  readonly name: string
  #socket: dgram.Socket

  constructor(host: string, port: number = DEFAULT_MIDI_UDP_PORT) {
    this.host = host
    this.port = port
    this.name = `net://${host}:${port}`
    this.#socket = dgram.createSocket('udp4')
  }

  send(type: MidiMessageType, args: MidiMessageData): void {
    const bytes = encodeMidiMessage(type, args)
    this.#socket.send(Buffer.from(bytes), this.port, this.host)
  }

  close(): void {
    this.#socket.close()
  }
}
