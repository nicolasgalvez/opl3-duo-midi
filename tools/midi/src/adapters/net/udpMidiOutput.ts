import dgram from 'node:dgram'
import { encodeMidiMessage } from '../../core/midiBytes.ts'
import { DEFAULT_MIDI_UDP_PORT } from '../../contracts/net.ts'
import type { MidiMessageType, MidiMessageData } from '../../contracts/midi.ts'
import type { MidiOutput } from '../../ports/midiOutput.ts'

// Drop-in replacement for easymidi.Output (same .send(type, args)/.close()
// shape) that ships raw MIDI bytes over a UDP socket instead of a USB cable.
//
// close() waits for in-flight sends: dgram queues every send behind an async
// address lookup, and closing the socket in the same tick silently drops the
// whole queue — which is exactly the shape of the one-shot CLI commands
// (`opl panic`/`opl pc` over --host: fire messages, close, exit).
export class UdpMidiOutput implements MidiOutput {
  readonly host: string
  readonly port: number
  readonly name: string
  #socket: dgram.Socket
  #pending = 0
  #closing = false

  constructor(host: string, port: number = DEFAULT_MIDI_UDP_PORT) {
    this.host = host
    this.port = port
    this.name = `net://${host}:${port}`
    this.#socket = dgram.createSocket('udp4')
  }

  send(type: MidiMessageType, args: MidiMessageData): void {
    const bytes = encodeMidiMessage(type, args)
    this.#pending++
    try {
      // The callback also swallows per-datagram errors (e.g. ICMP port
      // unreachable) that would otherwise crash the process as an unhandled
      // socket 'error' event — this transport is fire-and-forget by design.
      this.#socket.send(Buffer.from(bytes), this.port, this.host, () => {
        this.#pending--
        if (this.#closing && this.#pending === 0) this.#socket.close()
      })
    } catch (e) {
      this.#pending--
      throw e
    }
  }

  close(): void {
    if (this.#closing) return
    this.#closing = true
    if (this.#pending === 0) this.#socket.close()
  }
}
