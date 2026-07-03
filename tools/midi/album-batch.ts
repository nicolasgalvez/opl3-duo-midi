// Autonomous, DISK-AWARE overnight ALBUM renderer for the Top-10 VGM list on the OPL3 Duo.
// Renders each top10/NN - Album/ folder as ONE continuous video via `opl render --album --obs`
// (mini player layout: minimized — no playlist, no overlay). Between albums: full MIDI reset
// (re-inits the OPL3 chips), OBS recovery, purge of OBS .mkv intermediates, loudness check,
// progress JSON. Resume-safe (skips finished albums). Waits for any other in-flight
// `opl render` (the standalone FF6 render) to finish before touching OBS.
//
// Disk policy: the host is nearly full. Final mp4 ≈ 2.35 GB/h; during the closing mux the OBS
// mkv + audio wav + mp4 coexist (~5.4 GB/h peak). We purge mkv intermediates each round so only
// the final mp4s persist, and BEFORE each album we check free space: if the album's peak need
// doesn't fit, we DEFER it (skip) and continue to smaller albums. Deferred albums are rendered
// on the next run after space is freed (resume-safe).
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import OBSWebSocket from 'obs-websocket-js'

import { buildControllerResetMessages, sendMessages } from './src/core/midiReset.ts'
import { midiOutputs, openUsbOutput } from './src/adapters/midi/outputs.ts'

const HOME = process.env.HOME
const TOP10 = `${HOME}/Music/video-game-music-90000-midi-files/top10`
const OUTDIR = `${HOME}/Music/vgm-renders/top10`
const MOVIES = `${HOME}/Movies`
const DURATIONS_FILE = `${HOME}/vgm/album-durations.json`
// Audio device is NOT forced here — opl reads OPL_AUDIO_DEVICE from tools/midi/.env,
// so changing interfaces only means editing .env (pass --audio-device to override).
const OBS_SOURCE = 'Browser 2'
const OBS_URL = 'ws://127.0.0.1:4455'
const OPL = `${HOME}/bin/opl`
const FFMPEG = `${HOME}/bin/ffmpeg`
const MIDI_CWD = `${HOME}/code/opl3-duo-midi/tools/midi`
const PROGRESS = `${OUTDIR}/_album_progress.json`
const LOGFILE = `${OUTDIR}/_album_batch.log`

const MIN_OK_BYTES = 5_000_000 // a real album video is much bigger than this
const INFLIGHT_MAX_MS = 6 * 3600 * 1000 // wait up to 6h for an external render to finish
const PEAK_GB_PER_HR = 5.36 // mkv + wav + mp4 coexisting at the closing mux
const SAFETY_MULT = 1.15 // +15% on the estimate
const SAFETY_FIXED_GB = 1.5 // + fixed headroom
const HARD_FLOOR_GB = 3.5 // never start an album below this free

interface AlbumInfo {
  name: string
  dir: string
  out: string
  title: string
  tracks: number
  seconds: number
}

interface AlbumRecord {
  album: string
  tracks: number
  minutes: number
  output: string
  ok?: boolean
  skipped?: boolean
  deferred?: boolean
  reason?: string
  error?: string
  sizeMB?: number
  wallSec?: number
  meanDb?: number | null
  maxDb?: number | null
}

interface RenderResult {
  ok: boolean
  code?: number | null
  error?: string
  totalSec: number | null
}

mkdirSync(OUTDIR, { recursive: true })
const DURATIONS: Record<string, number> = (() => {
  try {
    return JSON.parse(readFileSync(DURATIONS_FILE, 'utf8'))
  } catch {
    return {}
  }
})()
const results: AlbumRecord[] = []
const deferred: string[] = []
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try {
    writeFileSync(LOGFILE, line + '\n', { flag: 'a' })
  } catch {
    /* ignore */
  }
}

function albums(): AlbumInfo[] {
  return readdirSync(TOP10, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{2} - /.test(d.name))
    .map((d) => d.name)
    .sort()
    .map((name) => ({
      name,
      dir: `${TOP10}/${name}`,
      out: `${OUTDIR}/${name}.mp4`,
      title: name.replace(/^\d+\s*-\s*/, ''),
      tracks: readdirSync(`${TOP10}/${name}`).filter((f) => /\.midi?$/i.test(f)).length,
      seconds: DURATIONS[name] || readdirSync(`${TOP10}/${name}`).filter((f) => /\.midi?$/i.test(f)).length * 162,
    }))
}

function freeGB(p: string): number {
  const r = spawnSync('df', ['-k', p], { encoding: 'utf8' })
  const lines = (r.stdout || '').trim().split('\n')
  const cols = (lines[lines.length - 1] || '').split(/\s+/)
  const availK = parseInt(cols[3] ?? '', 10)
  return Number.isFinite(availK) ? (availK * 1024) / 1e9 : 0
}
function needGB(seconds: number): number {
  return (seconds / 3600) * PEAK_GB_PER_HR * SAFETY_MULT + SAFETY_FIXED_GB
}

function purgeObsMkv(): void {
  let freed = 0
  try {
    for (const f of readdirSync(MOVIES)) {
      if (!/^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.mkv$/.test(f)) continue // OBS auto-named only
      const p = `${MOVIES}/${f}`
      try {
        const sz = statSync(p).size
        unlinkSync(p)
        freed += sz
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  if (freed) log(`purged OBS mkv intermediates: ${(freed / 1e9).toFixed(2)}GB`)
}

async function connectObs(): Promise<OBSWebSocket | null> {
  const obs = new OBSWebSocket()
  try {
    await obs.connect(OBS_URL)
    return obs
  } catch {
    return null
  }
}
async function ensureObsUp(): Promise<OBSWebSocket | null> {
  let obs = await connectObs()
  if (obs) return obs
  log('OBS not reachable — relaunching (open -a OBS)')
  spawnSync('open', ['-a', 'OBS'])
  for (let i = 0; i < 45; i++) {
    await sleep(2000)
    obs = await connectObs()
    if (obs) {
      log(`OBS back after ${(i + 1) * 2}s`)
      return obs
    }
  }
  log('OBS still down after 90s')
  return null
}
async function ensureIdle(obs: OBSWebSocket): Promise<void> {
  try {
    const { outputActive } = await obs.call('GetRecordStatus')
    if (outputActive) {
      log('OBS was recording — stopping')
      await obs.call('StopRecord')
      await sleep(1500)
    }
  } catch {
    /* ignore */
  }
}

function otherRenderRunning(): boolean {
  const r = spawnSync('pgrep', ['-f', 'opl.mjs render'], { encoding: 'utf8' })
  return (
    (r.stdout || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean).length > 0
  )
}
async function waitForNoOtherRender(): Promise<void> {
  if (!otherRenderRunning()) return
  log('Another opl render is in flight (standalone FF6?). Waiting for it to finish…')
  const start = Date.now()
  let n = 0
  while (otherRenderRunning() && Date.now() - start < INFLIGHT_MAX_MS) {
    await sleep(30000)
    if (++n % 10 === 0) log(`…waiting on in-flight render (${Math.round((Date.now() - start) / 60000)} min)`)
  }
  log(otherRenderRunning() ? 'In-flight wait capped — taking over.' : 'In-flight render finished.')
  await sleep(3000)
}

// Full GM-style reset between albums, shared with the CLI's own track-to-track
// reset (src/core/midiReset.ts), plus a MIDI System Reset to re-init the chips.
async function fullReset(): Promise<void> {
  try {
    const outs = midiOutputs()
    const name = outs.find((n) => n.includes('OPL3Duo')) || outs[0]
    if (!name) {
      log('reset: no MIDI output found')
      return
    }
    const out = openUsbOutput(name)
    sendMessages(out, buildControllerResetMessages())
    out.send('reset')
    await sleep(400)
    try {
      out.close()
    } catch {
      /* ignore */
    }
  } catch (e) {
    log(`reset error: ${(e as Error).message}`)
  }
}

function loudness(file: string): { meanDb: number | null; maxDb: number | null } {
  try {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '/dev/null'], {
      encoding: 'utf8',
    })
    const out = (r.stderr || '') + (r.stdout || '')
    const mean = out.match(/mean_volume:\s*(-?[\d.]+) dB/)
    const max = out.match(/max_volume:\s*(-?[\d.]+) dB/)
    return { meanDb: mean ? +mean[1]! : null, maxDb: max ? +max[1]! : null }
  } catch {
    return { meanDb: null, maxDb: null }
  }
}

function render(albumDir: string, outputAbs: string, title: string, seconds: number): Promise<RenderResult> {
  return new Promise((resolve) => {
    const args = [
      'render',
      albumDir,
      '--album',
      '--obs',
      '--layout',
      'minimized',
      '--obs-source',
      OBS_SOURCE,
      '--title',
      title,
      '-o',
      outputAbs,
    ]
    const child = spawn(OPL, args, { cwd: MIDI_CWD })
    let killed = false
    let totalSec: number | null = seconds || null
    const budget0 = seconds ? seconds * 1000 * 1.4 + 900000 : 0
    let timer = setTimeout(() => fail('timeout-startup'), 300000)
    if (budget0) {
      clearTimeout(timer)
      timer = setTimeout(() => fail('timeout'), budget0)
    }
    function fail(reason: string): void {
      if (killed) return
      killed = true
      log(`  killing render (${reason})`)
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: reason, totalSec })
    }
    function onData(buf: Buffer): void {
      const s = buf.toString()
      const m = s.match(/([\d.]+)s total/) || s.match(/\(([\d.]+)s\)/)
      if (m && !seconds && !totalSec) {
        totalSec = parseFloat(m[1]!)
        clearTimeout(timer)
        timer = setTimeout(() => fail('timeout'), totalSec * 1000 * 1.4 + 900000)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => {
      if (killed) return
      clearTimeout(timer)
      resolve({ ok: code === 0, code, totalSec })
    })
    child.on('error', (e) => {
      if (killed) return
      clearTimeout(timer)
      resolve({ ok: false, error: e.message, totalSec })
    })
  })
}

;(async () => {
  const list = albums()
  log(
    `=== ALBUM batch start: ${list.length} albums, ${(list.reduce((s, a) => s + a.seconds, 0) / 3600).toFixed(1)}h music -> ${OUTDIR} ===`,
  )
  let obs: OBSWebSocket | null = null
  for (const a of list) {
    const rec: AlbumRecord = {
      album: a.title,
      tracks: a.tracks,
      minutes: +(a.seconds / 60).toFixed(0),
      output: `${a.title}.mp4`,
    }
    if (existsSync(a.out) && statSync(a.out).size > MIN_OK_BYTES) {
      rec.ok = true
      rec.skipped = true
      rec.sizeMB = +(statSync(a.out).size / 1e6).toFixed(1)
      results.push(rec)
      writeFileSync(PROGRESS, JSON.stringify({ results, deferred }, null, 2))
      log(`SKIP (exists) ${a.title} (${rec.sizeMB}MB)`)
      continue
    }
    await waitForNoOtherRender()
    purgeObsMkv()
    if (existsSync(a.out) && statSync(a.out).size > MIN_OK_BYTES) {
      rec.ok = true
      rec.skipped = true
      rec.sizeMB = +(statSync(a.out).size / 1e6).toFixed(1)
      results.push(rec)
      writeFileSync(PROGRESS, JSON.stringify({ results, deferred }, null, 2))
      log(`SKIP (finished by standalone render) ${a.title} (${rec.sizeMB}MB)`)
      continue
    }
    if (a.tracks === 0) {
      rec.ok = false
      rec.error = 'empty-folder'
      results.push(rec)
      writeFileSync(PROGRESS, JSON.stringify({ results, deferred }, null, 2))
      log(`FAIL empty ${a.title}`)
      continue
    }

    // ---- disk gate ----
    const free = freeGB('/'),
      need = needGB(a.seconds)
    if (free < need || free < HARD_FLOOR_GB) {
      rec.deferred = true
      rec.reason = `disk: free ${free.toFixed(1)}GB < need ${need.toFixed(1)}GB`
      deferred.push(a.title)
      results.push(rec)
      writeFileSync(PROGRESS, JSON.stringify({ results, deferred }, null, 2))
      log(`DEFER ${a.title} (${rec.minutes}min) — ${rec.reason}; trying smaller albums`)
      continue
    }

    log(
      `RENDER ${a.title} (${a.tracks} tracks, ${rec.minutes}min) — free ${free.toFixed(1)}GB, need ${need.toFixed(1)}GB`,
    )
    obs = await ensureObsUp()
    if (obs) await ensureIdle(obs)
    const start = Date.now()
    const res = await render(a.dir, a.out, a.title, a.seconds)
    if (obs) {
      try {
        await ensureIdle(obs)
      } catch {
        obs = null
      }
    }
    await fullReset()
    await sleep(2000)
    purgeObsMkv() // reclaim this album's mkv so only the mp4 persists
    const okFile = res.ok && existsSync(a.out) && statSync(a.out).size > MIN_OK_BYTES
    rec.ok = !!okFile
    rec.wallSec = Math.round((Date.now() - start) / 1000)
    if (okFile) {
      const l = loudness(a.out)
      rec.meanDb = l.meanDb
      rec.maxDb = l.maxDb
      rec.sizeMB = +(statSync(a.out).size / 1e6).toFixed(1)
    } else rec.error = res.error || `exit ${res.code}`
    results.push(rec)
    writeFileSync(PROGRESS, JSON.stringify({ results, deferred }, null, 2))
    log(
      `${okFile ? 'OK' : 'FAIL'} ${a.title} ${okFile ? `(${rec.sizeMB}MB, mean ${rec.meanDb}dB, ${rec.wallSec}s)` : `(${rec.error})`} — free now ${freeGB('/').toFixed(1)}GB`,
    )
  }
  const ok = results.filter((r) => r.ok).length
  log(
    `=== ALBUM batch DONE: ${ok} rendered, ${deferred.length} deferred${deferred.length ? ` [${deferred.join(', ')}]` : ''} ===`,
  )
  if (deferred.length) log(`To finish the rest: free disk space, then rerun this batch (resume-safe).`)
  try {
    if (obs) await obs.disconnect()
  } catch {
    /* ignore */
  }
  process.exit(0)
})()
