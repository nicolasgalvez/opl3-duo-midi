import dgram from 'node:dgram'
import { encodeMidiMessage } from '../../core/midiBytes.ts'
import { DEFAULT_MIDI_UDP_PORT } from '../../contracts/net.ts'
import type { MidiMessageType, MidiMessageData } from '../../contracts/midi.ts'
import type { MidiOutput } from '../../ports/midiOutput.ts'

// Grace period between the warm-up datagram and ready() resolving — long
// enough for ARP to resolve on ethernet (~1ms) or wifi (tens of ms).
const WARMUP_MS = 150

// Warm-up payload: noteoff for note 0 on channel 1. A noteoff for a note
// that isn't sounding is a no-op in every GM synth, but it counts as MIDI
// activity to mt32-pi, whose power-saving mode (power_save_timeout) throttles
// the CPU and stops the audio device until a MIDI message wakes it — a burst
// sent while it's still throttled gets partially dropped by its one-packet-
// per-yield UDP receiver. Deliberately NOT 0xFE Active Sensing: mt32-pi arms
// a 330ms all-sound-off watchdog after seeing 0xFE.
export const WARMUP_MIDI_BYTES = [0x80, 0x00, 0x00]

// Drop-in replacement for easymidi.Output (same .send(type, args)/.close()
// shape) that ships raw MIDI bytes over a UDP socket instead of a USB cable.
//
// close() waits for in-flight sends: dgram queues every send behind an async
// address lookup, and closing the socket in the same tick silently drops the
// whole queue — which is exactly the shape of the one-shot CLI commands
// (`opl panic`/`opl pc` over --host: fire messages, close, exit).
//
// Opening the socket also fires a warm-up datagram (WARMUP_MIDI_BYTES), which
// does two jobs at once: it starts ARP resolution on the sending host — macOS
// holds only net.link.ether.inet.maxhold (16) packets per destination while
// ARP resolves and silently drops the rest — and it wakes an mt32-pi out of
// power-saving mode before real traffic arrives. Callers about to send a
// >16-datagram burst should `await ready()` first.
export class UdpMidiOutput implements MidiOutput {
  readonly host: string
  readonly port: number
  readonly name: string
  #socket: dgram.Socket
  #pending = 0
  #closing = false
  #ready: Promise<void>

  constructor(host: string, port: number = DEFAULT_MIDI_UDP_PORT, opts: { warmupMs?: number } = {}) {
    this.host = host
    this.port = port
    this.name = `net://${host}:${port}`
    this.#socket = dgram.createSocket('udp4')
    const warmupMs = opts.warmupMs ?? WARMUP_MS
    this.#ready = new Promise((resolve) => {
      // unref() so one-shot commands that never await ready() exit on time.
      const graceThenResolve = () => setTimeout(resolve, warmupMs).unref()
      try {
        this.#sendBytes(Buffer.from(WARMUP_MIDI_BYTES), graceThenResolve)
      } catch {
        graceThenResolve() // fire-and-forget: a dead socket must not wedge ready()
      }
    })
  }

  /** Resolves once the network path has had time to resolve ARP; await before burst traffic. */
  ready(): Promise<void> {
    return this.#ready
  }

  send(type: MidiMessageType, args: MidiMessageData): void {
    this.#sendBytes(Buffer.from(encodeMidiMessage(type, args)))
  }

  #sendBytes(buf: Buffer, onSent?: () => void): void {
    this.#pending++
    try {
      // The callback also swallows per-datagram errors (e.g. ICMP port
      // unreachable) that would otherwise crash the process as an unhandled
      // socket 'error' event — this transport is fire-and-forget by design.
      this.#socket.send(buf, this.port, this.host, () => {
        this.#pending--
        if (this.#closing && this.#pending === 0) this.#socket.close()
        onSent?.()
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
