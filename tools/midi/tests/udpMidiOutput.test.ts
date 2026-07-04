import { test } from 'node:test'
import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { UdpMidiOutput, WARMUP_MIDI_BYTES } from '../src/adapters/net/udpMidiOutput.ts'
import { DEFAULT_MIDI_UDP_PORT } from '../src/contracts/net.ts'

function withUdpServer(fn: (server: dgram.Socket, port: number) => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const server = dgram.createSocket('udp4')
    server.on('error', reject)
    server.bind(0, '127.0.0.1', async () => {
      const { port } = server.address()
      try {
        await fn(server, port)
      } finally {
        server.close()
      }
      resolve()
    })
  })
}

const isWarmup = (m: Buffer) =>
  m.length === WARMUP_MIDI_BYTES.length && [...m].every((b, i) => b === WARMUP_MIDI_BYTES[i])

/** First non-warm-up datagram (skips the wake/ARP warm-up sent on open). */
function onceMidiData(server: dgram.Socket): Promise<Buffer> {
  return new Promise<Buffer>((resolve) => {
    const onMessage = (m: Buffer) => {
      if (isWarmup(m)) return
      server.off('message', onMessage)
      resolve(m)
    }
    server.on('message', onMessage)
  })
}

// macOS holds only net.link.ether.inet.maxhold (16) packets per destination
// while ARP resolves and silently drops the rest, and mt32-pi's power-saving
// mode throttles its CPU until the first MIDI message wakes it — either way a
// cold first `opl play` used to lose most of its t=0 program-change burst.
// The warm-up datagram (a no-op noteoff) starts ARP resolution and wakes the
// device at open time, before any real traffic.
test('UdpMidiOutput sends a no-op noteoff warm-up datagram on open, before any send()', async () => {
  await withUdpServer(async (server, port) => {
    const received = new Promise<Buffer>((resolve) => server.once('message', resolve))
    const out = new UdpMidiOutput('127.0.0.1', port)
    const msg = await received
    assert.deepEqual([...msg], WARMUP_MIDI_BYTES)
    out.close()
  })
})

test('UdpMidiOutput.ready resolves after the warm-up grace period', async () => {
  await withUdpServer(async (server, port) => {
    const out = new UdpMidiOutput('127.0.0.1', port, { warmupMs: 20 })
    const t0 = performance.now()
    await out.ready()
    assert.ok(performance.now() - t0 >= 19, 'ready() resolved before the grace period elapsed')
    await out.ready() // second await resolves without another grace period
    out.close()
  })
})

test('UdpMidiOutput.ready keeps warm-up traffic ahead of the first real send', async () => {
  await withUdpServer(async (server, port) => {
    const received: Buffer[] = []
    server.on('message', (m) => received.push(m))
    const out = new UdpMidiOutput('127.0.0.1', port, { warmupMs: 20 })
    await out.ready()
    out.send('program', { number: 51, channel: 0 })
    await new Promise((r) => setTimeout(r, 100))
    assert.ok(isWarmup(received[0]!), 'warm-up datagram should arrive first')
    assert.deepEqual([...received[1]!], [0xc0, 51])
    out.close()
  })
})

test('UdpMidiOutput defaults to port 1999', () => {
  const out = new UdpMidiOutput('192.168.1.121')
  assert.equal(out.port, 1999)
  assert.equal(DEFAULT_MIDI_UDP_PORT, 1999)
  out.close()
})

test('UdpMidiOutput.name identifies the network target', () => {
  const out = new UdpMidiOutput('192.168.1.121', 1999)
  assert.equal(out.name, 'net://192.168.1.121:1999')
  out.close()
})

test('UdpMidiOutput.send delivers raw MIDI bytes over UDP to host:port', async () => {
  await withUdpServer(async (server, port) => {
    const received = onceMidiData(server)
    const out = new UdpMidiOutput('127.0.0.1', port)
    out.send('noteon', { note: 60, velocity: 100, channel: 0 })
    const msg = await received
    assert.deepEqual([...msg], [0x90, 60, 100])
    out.close()
  })
})

test('UdpMidiOutput.send can deliver a sysex message', async () => {
  await withUdpServer(async (server, port) => {
    const received = onceMidiData(server)
    const out = new UdpMidiOutput('127.0.0.1', port)
    out.send('sysex', [0xf0, 0x7d, 0x00, 0xf7])
    const msg = await received
    assert.deepEqual([...msg], [0xf0, 0x7d, 0x00, 0xf7])
    out.close()
  })
})

test('UdpMidiOutput.close does not throw', () => {
  const out = new UdpMidiOutput('127.0.0.1', 1999)
  assert.doesNotThrow(() => out.close())
})

test('UdpMidiOutput.close is idempotent', () => {
  const out = new UdpMidiOutput('127.0.0.1', 1999)
  out.close()
  assert.doesNotThrow(() => out.close())
})

// dgram queues each send behind an async lookup; closing the socket in the
// same tick used to drop every still-queued datagram. That is exactly the
// shape of `opl panic`/`opl pc` over --host: fire messages, close, exit —
// and none of them ever reached the device.
test('UdpMidiOutput.close flushes queued datagrams instead of dropping them', async () => {
  await withUdpServer(async (server, port) => {
    const COUNT = 48 // mirrors `opl panic`: 3 CCs x 16 channels, close immediately
    const received: Buffer[] = []
    const allArrived = new Promise<void>((resolve) => {
      server.on('message', (m) => {
        if (isWarmup(m)) return // ignore the wake/ARP warm-up datagram
        received.push(m)
        if (received.length === COUNT) resolve()
      })
    })
    const out = new UdpMidiOutput('127.0.0.1', port)
    for (let ch = 0; ch < 16; ch++) {
      out.send('cc', { controller: 64, value: 0, channel: ch })
      out.send('cc', { controller: 120, value: 0, channel: ch })
      out.send('cc', { controller: 123, value: 0, channel: ch })
    }
    out.close() // same tick as the sends — must not drop what is still queued

    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`only ${received.length}/${COUNT} datagrams arrived — close dropped the rest`)),
        2000,
      )
    })
    try {
      await Promise.race([allArrived, timeout])
    } finally {
      clearTimeout(timer)
    }
    assert.equal(received.length, COUNT)
  })
})
