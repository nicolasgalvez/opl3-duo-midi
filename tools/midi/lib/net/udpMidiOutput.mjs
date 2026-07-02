import dgram from 'node:dgram'
import { encodeMidiMessage } from './midiBytes.mjs'

// mt32-pi's raw UDP MIDI receiver (and other wifi-MIDI targets) listen here by
// convention: https://github.com/dwhinham/mt32-pi/wiki/Networking%3A-UDP-MIDI
export const DEFAULT_MIDI_UDP_PORT = 1999

// Drop-in replacement for easymidi.Output (same .send(type, args)/.close()
// shape) that ships raw MIDI bytes over a UDP socket instead of a USB cable.
export class UdpMidiOutput {
  constructor(host, port = DEFAULT_MIDI_UDP_PORT) {
    this.host = host
    this.port = port
    this.name = `net://${host}:${port}`
    this._socket = dgram.createSocket('udp4')
  }

  send(type, args) {
    const bytes = encodeMidiMessage(type, args)
    this._socket.send(Buffer.from(bytes), this.port, this.host)
  }

  close() {
    this._socket.close()
  }
}
