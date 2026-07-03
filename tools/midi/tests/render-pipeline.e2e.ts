import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

// Full `opl render` pipeline e2e (ODM-13): MIDI scheduling -> a real synth ->
// audio capture -> headless-browser video -> ffmpeg mux, asserted on the
// finished MP4. fluidsynth + the ticket's TimGM6mb.sf2 GM soundfont stand in
// for the OPL3 Duo hardware, so this runs on both Linux and macOS in CI.
//
// Opt-in (needs host audio plumbing), via env:
//   OPL_RENDER_E2E=1        enables the test (otherwise it skips)
//   OPL_AUDIO_DEVICE        capture device that hears fluidsynth's output
//                           (CI: ALSA snd-aloop "Loopback" / "BlackHole 2ch")
//   OPL_FLUID_ALSA_DEVICE   Linux only: ALSA device fluidsynth plays into
// Requires fluidsynth, ffmpeg/ffprobe, and Playwright chromium.

const here = dirname(fileURLToPath(import.meta.url))
const TOOL_DIR = join(here, '..')
const OPL = join(TOOL_DIR, 'opl.mjs')
const SOUNDFONT = join(here, 'fixtures', 'TimGM6mb.sf2')
const TRACK = join(here, 'fixtures', 'scale.mid')

const ENABLED = process.env.OPL_RENDER_E2E === '1'

function haveBin(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0
}

function fluidsynthArgs(): string[] {
  // -s: keep running as a server; -i: no interactive shell; -g: gain.
  // OPL_FLUID_AUDIO_DEVICE aims fluidsynth's output at the loopback device
  // directly (no need to change the system default output): the ALSA
  // snd-aloop playback side on Linux, "BlackHole 2ch" on macOS.
  const common = ['-si', '-g', '1']
  const device = process.env.OPL_FLUID_AUDIO_DEVICE
  if (os.platform() === 'darwin') {
    const target = device ? ['-o', `audio.coreaudio.device=${device}`] : []
    return [...common, '-a', 'coreaudio', ...target, '-m', 'coremidi', SOUNDFONT]
  }
  return [...common, '-a', 'alsa', '-o', `audio.alsa.device=${device || 'default'}`, '-m', 'alsa_seq', SOUNDFONT]
}

function oplSync(args: string[], timeoutMs = 120_000) {
  // A developer .env would silently sabotage the run: OPL_MIDI_HOST reroutes
  // MIDI to the network target instead of fluidsynth (net wins over --device),
  // and OPL_AUDIO_CHANNELS picks capture channels the loopback device may not
  // have. Pre-set them to '' — loadEnvFile never overrides an existing
  // variable, even an empty one.
  const env = { ...process.env, OPL_MIDI_HOST: '', OPL_MIDI_PORT: '', OPL_AUDIO_CHANNELS: '' }
  return spawnSync(process.execPath, [OPL, ...args], { cwd: TOOL_DIR, encoding: 'utf8', timeout: timeoutMs, env })
}

async function waitForFluidPort(timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    last = oplSync(['list'], 10_000).stdout ?? ''
    const line = last.split('\n').find((l) => /fluid/i.test(l))
    if (line) return line.trim().replace(/^-\s*/, '')
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`fluidsynth MIDI port never appeared in \`opl list\`. Last output:\n${last}`)
}

function ffprobe(file: string): { streams: string[]; durationSec: number } {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'default=nw=1', file],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 0, `ffprobe failed: ${r.stderr}`)
  const streams = [...r.stdout.matchAll(/codec_type=(\w+)/g)].map((m) => m[1]!)
  const duration = Number(r.stdout.match(/duration=([\d.]+)/)?.[1] ?? NaN)
  return { streams, durationSec: duration }
}

function meanVolumeDb(file: string): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '/dev/null'], {
    encoding: 'utf8',
  })
  const m = ((r.stderr || '') + (r.stdout || '')).match(/mean_volume:\s*(-?[\d.]+) dB/)
  assert.ok(m, 'ffmpeg volumedetect reported no mean_volume')
  return Number(m[1])
}

test(
  'opl render produces a non-silent MP4 end to end through fluidsynth',
  { skip: !ENABLED && 'set OPL_RENDER_E2E=1 (plus OPL_AUDIO_DEVICE + fluidsynth/ffmpeg) to run', timeout: 300_000 },
  async () => {
    const audioDevice = process.env.OPL_AUDIO_DEVICE
    assert.ok(audioDevice, 'OPL_RENDER_E2E=1 requires OPL_AUDIO_DEVICE (a loopback of fluidsynth’s output)')
    assert.ok(haveBin('fluidsynth'), 'fluidsynth not found on PATH')
    assert.ok(haveBin('ffmpeg') && haveBin('ffprobe'), 'ffmpeg/ffprobe not found on PATH')

    // Always log the capture devices RtAudio sees — when a runner's device
    // naming shifts, this is the line that explains the failure.
    console.log(oplSync(['render', '--list-audio'], 30_000).stdout)

    const tmpDir = mkdtempSync(join(os.tmpdir(), 'opl-e2e-'))
    const outFile = join(tmpDir, 'out.mp4')
    const fluid: ChildProcess = spawn('fluidsynth', fluidsynthArgs(), { stdio: ['ignore', 'pipe', 'pipe'] })
    let fluidLog = ''
    fluid.stdout?.on('data', (d: Buffer) => (fluidLog += d))
    fluid.stderr?.on('data', (d: Buffer) => (fluidLog += d))

    try {
      const port = await waitForFluidPort()
      console.log(`fluidsynth MIDI port: ${port}`)

      const render = oplSync([
        'render',
        TRACK,
        '--device',
        'fluid',
        '--audio-device',
        audioDevice,
        '--resolution',
        '320x240',
        '--fps',
        '10',
        '--tail',
        '1',
        '-o',
        outFile,
      ])
      assert.equal(
        render.status,
        0,
        `opl render exited ${render.status}\n--- stdout ---\n${render.stdout}\n--- stderr ---\n${render.stderr}\n--- fluidsynth ---\n${fluidLog}`,
      )

      assert.ok(existsSync(outFile), 'no output MP4 was written')
      assert.ok(statSync(outFile).size > 10_000, `output MP4 suspiciously small: ${statSync(outFile).size} bytes`)

      const { streams, durationSec } = ffprobe(outFile)
      assert.ok(streams.includes('video'), `no video stream in output (streams: ${streams.join(', ')})`)
      assert.ok(streams.includes('audio'), `no audio stream in output (streams: ${streams.join(', ')})`)
      // scale.mid is ~1.45s + 1s tail; allow generous slack for startup padding.
      assert.ok(
        durationSec > 1 && durationSec < 20,
        `output duration ${durationSec}s is not in the plausible 1-20s range`,
      )

      // The point of the whole exercise: the MIDI actually became sound and
      // the capture heard it. Digital silence floors around -91 dB.
      const mean = meanVolumeDb(outFile)
      console.log(`mean_volume: ${mean} dB`)
      assert.ok(mean > -70, `rendered audio is silent (mean_volume ${mean} dB) — MIDI->synth->capture chain broken`)
    } finally {
      fluid.kill('SIGTERM')
      rmSync(tmpDir, { recursive: true, force: true })
    }
  },
)
