import { test } from 'node:test'
import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { UdpMidiOutput } from '../src/adapters/net/udpMidiOutput.ts'
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
    const received = new Promise<Buffer>((resolve) => server.once('message', resolve))
    const out = new UdpMidiOutput('127.0.0.1', port)
    out.send('noteon', { note: 60, velocity: 100, channel: 0 })
    const msg = await received
    assert.deepEqual([...msg], [0x90, 60, 100])
    out.close()
  })
})

test('UdpMidiOutput.send can deliver a sysex message', async () => {
  await withUdpServer(async (server, port) => {
    const received = new Promise<Buffer>((resolve) => server.once('message', resolve))
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
