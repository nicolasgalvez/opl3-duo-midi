// UDP-MIDI -> fluidsynth TCP-shell bridge, for hosts with no kernel ALSA
// sequencer (GitHub's ubuntu runners on Azure 6.x kernels ship no sound
// modules at all, so RtMidi/alsa_seq virtual ports are impossible there).
// `opl render --host 127.0.0.1 --net-port <udp>` sends its raw MIDI bytes
// here — through the same UdpMidiOutput adapter real network targets use —
// and each message is translated to a fluidsynth shell command.
//
//   node tests/fluidUdpBridge.ts <udpPort> <fluidShellPort>
//
// Prints "bridge: ready" once connected to fluidsynth; the e2e waits for it.
import dgram from 'node:dgram'
import net from 'node:net'

const udpPort = Number(process.argv[2] ?? 17999)
const shellPort = Number(process.argv[3] ?? 9800)

function toShellCommand(b: Buffer): string | null {
  if (b.length === 0) return null
  const status = b[0]! >> 4
  const ch = b[0]! & 0x0f
  switch (status) {
    case 0x9:
      return b[2]! > 0 ? `noteon ${ch} ${b[1]} ${b[2]}` : `noteoff ${ch} ${b[1]}`
    case 0x8:
      return `noteoff ${ch} ${b[1]}`
    case 0xb:
      return `cc ${ch} ${b[1]} ${b[2]}`
    case 0xc:
      return `prog ${ch} ${b[1]}`
    case 0xe:
      return `pitch_bend ${ch} ${(b[2]! << 7) | b[1]!}`
    default:
      return null // sysex / realtime — nothing for a GM soundfont to do
  }
}

async function connectWithRetry(port: number, tries = 40): Promise<net.Socket> {
  for (let i = 0; i < tries; i++) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const sock = net.createConnection(port, '127.0.0.1')
        sock.once('connect', () => resolve(sock))
        sock.once('error', reject)
      })
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`could not reach fluidsynth shell on tcp ${port}`)
}

const tcp = await connectWithRetry(shellPort)
tcp.on('data', () => {}) // discard shell prompts/echo
tcp.on('error', (e) => {
  console.error('bridge: fluidsynth connection lost:', e.message)
  process.exit(1)
})

const sock = dgram.createSocket('udp4')
sock.on('message', (buf) => {
  const cmd = toShellCommand(buf)
  if (cmd) tcp.write(cmd + '\n')
})
sock.bind(udpPort, '127.0.0.1', () => {
  console.log(`bridge: ready (udp ${udpPort} -> fluidsynth tcp ${shellPort})`)
})
