import { test } from 'node:test'
import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Drives the real CLI (`node opl.mjs note ... --host 127.0.0.1`) and asserts
// the exact MIDI bytes that arrive on a local UDP wire tap.

const OPL = join(dirname(fileURLToPath(import.meta.url)), '..', 'opl.mjs')

async function captureWire(args: string[], expectCount: number): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const server = dgram.createSocket('udp4')
    const datagrams: number[][] = []
    const finish = (err?: Error) => {
      clearTimeout(timer)
      server.close()
      if (err) reject(err)
      else resolve(datagrams)
    }
    const timer = setTimeout(
      () =>
        finish(new Error(`only ${datagrams.length}/${expectCount} datagrams arrived: ${JSON.stringify(datagrams)}`)),
      10_000,
    )
    server.on('message', (buf) => {
      datagrams.push([...buf])
      if (datagrams.length === expectCount) finish()
    })
    server.bind(0, '127.0.0.1', () => {
      const { port } = server.address()
      const r = spawnSync(process.execPath, [OPL, ...args, '--host', '127.0.0.1', '--net-port', String(port)], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      if (r.status !== 0) finish(new Error(`opl exited ${r.status}: ${r.stderr}`))
    })
  })
}

test('note --pc selects the GM program before the note plays', async () => {
  const wire = await captureWire(['note', '60', '--pc', '24', '--dur', '0.05'], 3)
  assert.deepEqual(wire, [
    [0xc0, 24], // program change: Acoustic Guitar (nylon)
    [0x90, 60, 100], // note on
    [0x80, 60, 0], // note off
  ])
})

test('note without --pc sends no program change', async () => {
  const wire = await captureWire(['note', '60', '--dur', '0.05'], 2)
  assert.deepEqual(wire, [
    [0x90, 60, 100],
    [0x80, 60, 0],
  ])
})

test('note --pc rejects an out-of-range program', async () => {
  const r = spawnSync(process.execPath, [OPL, 'note', '60', '--pc', '200', '--host', '127.0.0.1'], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Invalid program/)
})
