#!/usr/bin/env node
/**
 * Audio capture integration test for `opl render`.
 *
 * Verifies that audio from the OPL3 synth (routed through the Clarett
 * interface into BlackHole 2ch) is actually captured by ffmpeg.
 *
 * Prerequisites:
 *   - OPL3 Teensy board connected and flashed
 *   - Audio routed: OPL3 line-out -> Clarett input -> BlackHole 2ch
 *
 * Usage:
 *   node tests/audio-capture.test.mjs
 *   node tests/audio-capture.test.mjs --audio "BlackHole 2ch" --midi "OPL3Duo"
 *   node tests/audio-capture.test.mjs --audio "Blackhole and clarett"
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import easymidi from 'easymidi'

// Load .env
try { process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '.env')) } catch { /* no .env */ }

// --- parse args ---
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/** Auto-detect an audio input device via ffmpeg device listing (macOS: AVFoundation). */
function detectAudioDevice() {
  try {
    const out = execSync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1', { encoding: 'utf8', timeout: 5000 })
    // Parse lines like: [AVFoundation indev @ 0x...] [2] BlackHole 2ch
    const devices = []
    let inAudio = false
    for (const line of out.split('\n')) {
      if (line.includes('audio devices')) inAudio = true
      else if (line.includes('video devices')) inAudio = false
      else if (inAudio) {
        const m = line.match(/\[\d+\]\s*(.+)/)
        if (m) devices.push(m[1].trim())
      }
    }
    // Prefer BlackHole, else first device
    return devices.find((d) => d.toLowerCase().includes('blackhole')) || devices[0] || null
  } catch { return null }
}

// Audio device: --audio arg -> OPL_AUDIO_DEVICE env -> auto-detect
const AUDIO_DEVICE = arg('audio', null) || process.env.OPL_AUDIO_DEVICE || detectAudioDevice()

// MIDI device: --midi arg -> OPL_MIDI_DEVICE env -> first available
const midiOutputs = easymidi.getOutputs()
const midiArg = arg('midi', null)
const MIDI_MATCH = midiArg || process.env.OPL_MIDI_DEVICE || midiOutputs[0] || 'OPL3Duo'
const NOTE_DUR = 2      // seconds the chord sustains
const TAIL = 1          // seconds of silence after note-off
const REC_DUR = NOTE_DUR + TAIL + 0.5

let passed = 0
let failed = 0

function check(condition, label) {
  if (condition) { console.log(`  PASS: ${label}`); passed++ }
  else { console.error(`  FAIL: ${label}`); failed++ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- run ---
async function main() {
  console.log('--- Audio Capture Integration Test ---\n')

  // 1. Find MIDI output
  console.log(`MIDI outputs: ${midiOutputs.join(', ') || '(none)'}`)
  const midiName = midiOutputs.find((n) => n.toLowerCase().includes(MIDI_MATCH.toLowerCase())) || midiOutputs[0]
  check(!!midiName, `MIDI device resolved to "${midiName}" (match: "${MIDI_MATCH}")`)
  if (!midiName) { console.error('\nCannot proceed without MIDI device.'); process.exit(1) }

  // 2. Resolve audio device
  if (!AUDIO_DEVICE) {
    console.error('No audio device found. Set OPL_AUDIO_DEVICE in .env or pass --audio.')
    process.exit(1)
  }
  console.log(`Audio device: "${AUDIO_DEVICE}"`)

  // 2. Verify audio device is listable by ffmpeg
  const tmpDir = mkdtempSync(join(tmpdir(), 'opl-audio-test-'))
  const wavFile = join(tmpDir, 'test.wav')

  // 3. Record silence as a baseline (500ms)
  console.log('\nRecording 0.5s silence baseline...')
  await new Promise((resolve) => {
    const p = spawn('ffmpeg', [
      '-f', 'avfoundation', '-i', `:${AUDIO_DEVICE}`,
      '-t', '0.5', '-ar', '48000', '-ac', '2',
      '-y', join(tmpDir, 'silence.wav'),
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    p.on('close', resolve)
  })

  const silenceStats = await analyze(join(tmpDir, 'silence.wav'))
  console.log(`  Baseline: mean ${silenceStats.mean.toFixed(1)} dB, max ${silenceStats.max.toFixed(1)} dB`)

  // 4. Record with audio: start ffmpeg, play chord, wait
  console.log(`\nRecording ${REC_DUR}s while playing C-major chord for ${NOTE_DUR}s...`)
  const out = new easymidi.Output(midiName)

  const ff = spawn('ffmpeg', [
    '-f', 'avfoundation', '-i', `:${AUDIO_DEVICE}`,
    '-t', String(REC_DUR),
    '-ar', '48000', '-ac', '2', '-sample_fmt', 's16',
    '-y', wavFile,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let ffErr = ''
  ff.stderr.on('data', (d) => { ffErr += d })

  // Let ffmpeg settle, then play
  await sleep(400)
  const notes = [60, 64, 67] // C4, E4, G4
  for (const n of notes) out.send('noteon', { note: n, velocity: 100, channel: 0 })

  await sleep(NOTE_DUR * 1000)

  for (const n of notes) out.send('noteoff', { note: n, velocity: 0, channel: 0 })
  out.send('cc', { controller: 123, value: 0, channel: 0 }) // all notes off
  out.close()

  await new Promise((r) => ff.on('close', r))

  // 5. Analyze the recording
  const stats = await analyze(wavFile)
  console.log(`\n  Recording: mean ${stats.mean.toFixed(1)} dB, max ${stats.max.toFixed(1)} dB`)
  console.log(`  Baseline:  mean ${silenceStats.mean.toFixed(1)} dB, max ${silenceStats.max.toFixed(1)} dB`)
  console.log(`  Delta:     mean ${(stats.mean - silenceStats.mean).toFixed(1)} dB, max ${(stats.max - silenceStats.max).toFixed(1)} dB`)

  // 6. Assertions
  console.log('\nResults:')
  check(stats.max > -35, `Max volume (${stats.max.toFixed(1)} dB) is above -35 dB — audio captured`)
  check(stats.mean > silenceStats.mean + 5, `Mean volume is at least 5 dB above silence baseline`)
  check(stats.mean > -55, `Mean volume (${stats.mean.toFixed(1)} dB) is above -55 dB — not silent`)

  // Cleanup
  try { rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

/** Run ffmpeg volumedetect and parse the result. */
function analyze(wavPath) {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-i', wavPath, '-af', 'volumedetect', '-f', 'null', '-'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stderr.on('data', (d) => { out += d })
    p.on('close', () => {
      const mean = parseFloat(out.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)?.[1] ?? '-999')
      const max = parseFloat(out.match(/max_volume:\s*(-?[\d.]+)\s*dB/)?.[1] ?? '-999')
      resolve({ mean, max })
    })
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
