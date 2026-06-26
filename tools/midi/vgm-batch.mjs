// Overnight batch renderer for the Top-50 VGM list on the OPL3 Duo.
// For each song: ensure OBS is up + idle, render via `opl render --obs`,
// send a full MIDI reset (re-inits the OPL3 chips), clean up the OBS .mkv,
// measure loudness, and record progress. Resume-safe (skips finished files).
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import easymidi from 'easymidi'
import OBSWebSocket from 'obs-websocket-js'

const HOME = process.env.HOME
const LIB = `${HOME}/Music/video-game-music-90000-midi-files`
const OUTDIR = `${HOME}/Music/vgm-renders/top50`
const MOVIES = `${HOME}/Movies`
const AUDIO_DEVICE = 'Burr-Brown'
const OBS_SOURCE = 'Browser 2'
const OBS_URL = 'ws://127.0.0.1:4455'
const OPL = `${HOME}/bin/opl`
const FFMPEG = `${HOME}/bin/ffmpeg`
const MIDI_CWD = `${HOME}/code/opl3-duo-midi/tools/midi`
const PROGRESS = `${OUTDIR}/_progress.json`
const LOGFILE = `${OUTDIR}/_batch.log`

const TMPMIDI = `${HOME}/vgm/midi-tmp`
mkdirSync(OUTDIR, { recursive: true })
mkdirSync(TMPMIDI, { recursive: true })
const songs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const results = []

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try { writeFileSync(LOGFILE, line + '\n', { flag: 'a' }) } catch {}
}
function sanitize(s) { return s.replace(/[\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() }

async function connectObs() {
  const obs = new OBSWebSocket()
  try { await obs.connect(OBS_URL); return obs } catch { return null }
}
async function ensureObsUp() {
  let obs = await connectObs()
  if (obs) return obs
  log('OBS not reachable — attempting relaunch (open -a OBS)')
  spawnSync('open', ['-a', 'OBS'])
  for (let i = 0; i < 45; i++) { await sleep(2000); obs = await connectObs(); if (obs) { log(`OBS back after ${(i + 1) * 2}s`); return obs } }
  log('OBS still down after 90s')
  return null
}
async function ensureIdle(obs) {
  try { const { outputActive } = await obs.call('GetRecordStatus'); if (outputActive) { log('OBS was recording — stopping'); await obs.call('StopRecord'); await sleep(1500) } } catch {}
}

function fullReset() {
  try {
    const outs = easymidi.getOutputs()
    const name = outs.find((n) => n.includes('OPL3Duo')) || outs[0]
    if (!name) { log('reset: no MIDI output found'); return }
    const out = new easymidi.Output(name)
    for (let ch = 0; ch < 16; ch++) {
      out.send('cc', { controller: 120, value: 0, channel: ch })
      out.send('cc', { controller: 123, value: 0, channel: ch })
      out.send('cc', { controller: 121, value: 0, channel: ch })
      out.send('cc', { controller: 64, value: 0, channel: ch })
      out.send('cc', { controller: 1, value: 0, channel: ch })
      out.send('cc', { controller: 11, value: 127, channel: ch })
      out.send('pitch', { value: 8192, channel: ch })
      out.send('program', { number: 0, channel: ch })
    }
    out.send('reset')
    return new Promise((r) => setTimeout(() => { try { out.close() } catch {}; r() }, 400))
  } catch (e) { log(`reset error: ${e.message}`) }
}

function cleanupMkv(sinceMs) {
  try { for (const f of readdirSync(MOVIES)) { if (!f.toLowerCase().endsWith('.mkv')) continue; const p = `${MOVIES}/${f}`; try { if (statSync(p).mtimeMs >= sinceMs - 1000) unlinkSync(p) } catch {} } } catch {}
}

function loudness(file) {
  try {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '/dev/null'], { encoding: 'utf8' })
    const out = (r.stderr || '') + (r.stdout || '')
    const mean = out.match(/mean_volume:\s*(-?[\d.]+) dB/)
    const max = out.match(/max_volume:\s*(-?[\d.]+) dB/)
    return { meanDb: mean ? +mean[1] : null, maxDb: max ? +max[1] : null }
  } catch { return { meanDb: null, maxDb: null } }
}

function render(inputAbs, outputAbs) {
  return new Promise((resolve) => {
    const args = ['render', inputAbs, '--obs', '--layout', 'minimized', '--audio-device', AUDIO_DEVICE, '--obs-source', OBS_SOURCE, '-o', outputAbs]
    const child = spawn(OPL, args, { cwd: MIDI_CWD })
    let killed = false, durationSec = null
    let timer = setTimeout(() => fail('timeout-startup'), 180000) // 3 min to even start/parse duration
    function fail(reason) { if (killed) return; killed = true; log(`  killing render (${reason})`); try { child.kill('SIGKILL') } catch {}; spawnSync('pkill', ['-9', '-f', 'opl.mjs render']); resolve({ ok: false, error: reason, durationSec }) }
    function onData(buf) {
      const s = buf.toString()
      const m = s.match(/\(([\d.]+)s\)/)
      if (m && !durationSec) { durationSec = parseFloat(m[1]); clearTimeout(timer); timer = setTimeout(() => fail('timeout'), durationSec * 2500 + 180000) /* ~2.5x (capture + ~1x mux) + 3min buffer */ }
    }
    child.stdout.on('data', onData); child.stderr.on('data', onData)
    child.on('close', (code) => { if (killed) return; clearTimeout(timer); resolve({ ok: code === 0, code, durationSec }) })
    child.on('error', (e) => { if (killed) return; clearTimeout(timer); resolve({ ok: false, error: e.message, durationSec }) })
  })
}

;(async () => {
  log(`=== VGM batch start: ${songs.length} songs -> ${OUTDIR} ===`)
  let obs = await ensureObsUp()
  for (const song of songs) {
    const base = `${String(song.rank).padStart(2, '0')} - ${sanitize(song.game)} - ${sanitize(song.title)}.mp4`
    const outputAbs = `${OUTDIR}/${base}`
    const inputAbs = `${LIB}/${song.file}`
    const rec = { rank: song.rank, title: song.title, game: song.game, output: base }
    if (existsSync(outputAbs) && statSync(outputAbs).size > 1_000_000) { rec.ok = true; rec.skipped = true; const l = loudness(outputAbs); rec.meanDb = l.meanDb; rec.maxDb = l.maxDb; rec.sizeMB = +(statSync(outputAbs).size / 1e6).toFixed(1); results.push(rec); log(`#${song.rank} SKIP (exists) ${base}`); writeFileSync(PROGRESS, JSON.stringify(results, null, 2)); continue }
    if (!existsSync(inputAbs)) { rec.ok = false; rec.error = 'midi-missing'; results.push(rec); log(`#${song.rank} FAIL midi missing: ${song.file}`); writeFileSync(PROGRESS, JSON.stringify(results, null, 2)); continue }
    // Render from a cleanly-named temp copy so the on-screen title is nice
    // (the visualizer shows basename(file)); library files stay untouched.
    const cleanTitle = `${sanitize(song.title)} — ${sanitize(song.game)}`
    const tmpMidi = `${TMPMIDI}/${cleanTitle}.mid`
    let renderInput = inputAbs
    try { copyFileSync(inputAbs, tmpMidi); renderInput = tmpMidi } catch (e) { log(`#${song.rank} tmp copy failed, using original: ${e.message}`) }
    log(`#${song.rank} RENDER ${base}  (title: ${cleanTitle})`)
    if (!obs) obs = await ensureObsUp()
    if (obs) await ensureIdle(obs)
    const start = Date.now()
    const res = await render(renderInput, outputAbs)
    try { rmSync(tmpMidi, { force: true }) } catch {}
    if (obs) { try { await ensureIdle(obs) } catch { obs = null } }
    await fullReset()
    await sleep(1500)
    cleanupMkv(start)
    const okFile = res.ok && existsSync(outputAbs) && statSync(outputAbs).size > 300_000
    rec.ok = !!okFile
    rec.durationSec = res.durationSec || null
    rec.wallSec = Math.round((Date.now() - start) / 1000)
    if (okFile) { const l = loudness(outputAbs); rec.meanDb = l.meanDb; rec.maxDb = l.maxDb; rec.sizeMB = +(statSync(outputAbs).size / 1e6).toFixed(1) }
    else rec.error = res.error || `exit ${res.code}`
    results.push(rec)
    writeFileSync(PROGRESS, JSON.stringify(results, null, 2))
    log(`#${song.rank} ${okFile ? 'OK' : 'FAIL'} ${base} ${okFile ? `(${rec.sizeMB}MB, mean ${rec.meanDb}dB, ${rec.wallSec}s)` : `(${rec.error})`}`)
  }
  const ok = results.filter((r) => r.ok).length
  log(`=== VGM batch DONE: ${ok}/${songs.length} ok ===`)
  try { if (obs) await obs.disconnect() } catch {}
  process.exit(0)
})()
