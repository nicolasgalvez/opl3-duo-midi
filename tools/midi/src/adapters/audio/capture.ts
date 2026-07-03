import { writeFileSync } from 'node:fs'
import audify from 'audify'

const { RtAudio } = audify
// audify types RtAudioFormat as an ambient const enum, which
// verbatimModuleSyntax forbids referencing at runtime — but the module also
// ships it as a real runtime object, so read the value from that instead.
const RTAUDIO_SINT16 = (audify as unknown as { RtAudioFormat: { RTAUDIO_SINT16: import('audify').RtAudioFormat } })
  .RtAudioFormat.RTAUDIO_SINT16

// Audio capture uses audify (RtAudio -> CoreAudio). ffmpeg's avfoundation
// indev drops ~6-10% of samples on this hardware; RtAudio captures cleanly.
function findInputDevice(name: string | undefined) {
  const rt = new RtAudio()
  const devs = rt.getDevices().filter((d) => d.inputChannels > 0)
  const lc = (name || '').toLowerCase()
  return devs.find((d) => d.name === name) || devs.find((d) => d.name.toLowerCase().includes(lc)) || null
}

export function writeWav(path: string, pcm: Buffer, sampleRate: number, channels: number): void {
  const bps = 16,
    blockAlign = (channels * bps) / 8
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * blockAlign, 28)
  h.writeUInt16LE(blockAlign, 32)
  h.writeUInt16LE(bps, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  writeFileSync(path, Buffer.concat([h, pcm]))
}

export interface AudioCaptureOptions {
  device: string
  channels?: string | null
  rate: number
  outFile: string
}

export interface AudioCapture {
  deviceName: string
  /** Stops the stream, writes the WAV, returns the captured frame count. */
  stop(): number
}

// Open an RtAudio input stream and start collecting PCM. `channels` is an
// optional "5,6"-style pair of 1-based inputs to capture as stereo; otherwise
// the first two channels are used. Returns { deviceName, stop() } where stop()
// writes the WAV and returns the captured frame count.
export function startAudioCapture({ device, channels, rate, outFile }: AudioCaptureOptions): AudioCapture {
  const dev = findInputDevice(device)
  if (!dev) throw new Error(`Audio input device not found: ${device}`)
  let firstChannel = 0
  if (channels) firstChannel = Math.min(...channels.split(',').map((n) => parseInt(n, 10) - 1))
  const nChannels = Math.min(2, dev.inputChannels - firstChannel)
  const rt = new RtAudio()
  const chunks: Buffer[] = []
  rt.openStream(
    null,
    { deviceId: dev.id, nChannels, firstChannel },
    RTAUDIO_SINT16,
    rate,
    1920,
    'opl-render',
    (buf) => chunks.push(Buffer.from(buf)),
    null,
  )
  rt.start()
  return {
    deviceName: dev.name,
    stop() {
      try {
        rt.stop()
      } catch {
        /* ignore */
      }
      try {
        rt.closeStream()
      } catch {
        /* ignore */
      }
      const pcm = Buffer.concat(chunks)
      writeWav(outFile, pcm, rate, nChannels)
      return pcm.length / 2 / nChannels
    },
  }
}

export async function listAudioDevices(): Promise<void> {
  const rt = new RtAudio()
  console.log('Audio input devices:\n')
  for (const d of rt.getDevices()) {
    if (d.inputChannels > 0) console.log(`  [${d.inputChannels}ch]  ${d.name}`)
  }
  console.log('\nPass the device name to --audio-device, and --audio-channels "5,6" to pick a stereo pair.')
}
