#!/usr/bin/env node
/**
 * opl — one CLI for the OPL3 Duo USB-MIDI synth.
 *
 * Owns a single MIDI connection (easymidi -> CoreMIDI), always pairs note-on with
 * note-off, and panics on every stop so notes can't hang.
 *
 *   opl list
 *   opl note 60 --vel 100 --dur 1 --ch 1
 *   opl chord 60 64 67
 *   opl scale
 *   opl pc 24                 # program change (prints GM name)
 *   opl cc 10 0               # control change (here: pan hard-left)
 *   opl panic
 *   opl play song.mid
 *   opl play "/a/folder" -r --shuffle --loop
 *
 * During `play` in a terminal:  n = next   p = prev   space = pause   q = quit
 */
import { readdirSync, readFileSync, writeFileSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { basename, extname, join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import easymidi from 'easymidi'
import toneMidiPkg from '@tonejs/midi'
import audify from 'audify'
import yargs from 'yargs'

const { Midi } = toneMidiPkg
const { RtAudio, RtAudioFormat } = audify

// Load tools/midi/.env (e.g. MIDI_LIBRARY) if present.
try { process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '.env')) } catch { /* no .env file */ }

// Resolve a path; for a relative path not found in cwd, fall back to MIDI_LIBRARY.
function resolveLib(p) {
  if (isAbsolute(p)) return p
  try { statSync(p); return p } catch { /* not relative to cwd */ }
  const base = process.env.MIDI_LIBRARY
  if (base) { const alt = join(base, p); try { statSync(alt); return alt } catch { /* not in library */ } }
  return p
}
import { hideBin } from 'yargs/helpers'

const DEFAULT_PORT_MATCH = 'OPL3Duo'
const MIDI_EXTS = ['.mid', '.midi']

const GM_NAMES = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
  'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
  'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
  'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass',
  'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
  'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
  'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
  'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
  'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
  'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  'Sitar', 'Banjo', 'Shamisen', 'Koto',
  'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
  'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
  'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
]

// --------------------------------------------------------------------------
function resolvePort(requested) {
  const names = easymidi.getOutputs()
  if (names.length === 0) {
    console.error('No MIDI output ports found. Is the Teensy plugged in and flashed?')
    process.exit(1)
  }
  const match = (requested || DEFAULT_PORT_MATCH).toLowerCase()
  const found = names.find((n) => n.toLowerCase().includes(match))
  if (found) return found
  if (requested) {
    console.error(`No output matching "${requested}". Available: ${names.join(', ')}`)
    process.exit(1)
  }
  return names[0]
}

function openOutput(requested) {
  const name = resolvePort(requested)
  return { out: new easymidi.Output(name), name }
}

function allNotesOff(out) {
  for (let ch = 0; ch < 16; ch++) {
    out.send('cc', { controller: 64, value: 0, channel: ch })   // sustain off
    out.send('cc', { controller: 120, value: 0, channel: ch })  // all sound off
    out.send('cc', { controller: 123, value: 0, channel: ch })  // all notes off
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --------------------------------------------------------------------------
//  Simple commands
// --------------------------------------------------------------------------
function cmdList() {
  console.log('MIDI outputs:')
  for (const n of easymidi.getOutputs()) console.log('  -', n)
}

async function cmdNote(argv) {
  const { out, name } = openOutput(argv.port)
  const ch = argv.ch - 1
  out.send('noteon', { note: argv.note, velocity: argv.vel, channel: ch })
  console.log(`${name}: note ${argv.note} ch${argv.ch} vel${argv.vel} for ${argv.dur}s`)
  await sleep(argv.dur * 1000)
  out.send('noteoff', { note: argv.note, velocity: 0, channel: ch })
  out.close()
}

async function cmdChord(argv) {
  const { out, name } = openOutput(argv.port)
  const ch = argv.ch - 1
  for (const n of argv.notes) out.send('noteon', { note: n, velocity: argv.vel, channel: ch })
  console.log(`${name}: chord ${argv.notes.join(' ')} ch${argv.ch} for ${argv.dur}s`)
  await sleep(argv.dur * 1000)
  for (const n of argv.notes) out.send('noteoff', { note: n, velocity: 0, channel: ch })
  out.close()
}

async function cmdScale(argv) {
  const { out, name } = openOutput(argv.port)
  const ch = argv.ch - 1
  const scale = [0, 2, 4, 5, 7, 9, 11, 12].map((s) => argv.root + s)
  console.log(`${name}: scale from ${argv.root} ch${argv.ch}`)
  for (const n of scale) {
    out.send('noteon', { note: n, velocity: argv.vel, channel: ch })
    await sleep(argv.dur * 1000)
    out.send('noteoff', { note: n, velocity: 0, channel: ch })
  }
  out.close()
}

function cmdPc(argv) {
  const { out, name } = openOutput(argv.port)
  out.send('program', { number: argv.program, channel: argv.ch - 1 })
  const label = GM_NAMES[argv.program] ?? '?'
  console.log(`${name}: program change ch${argv.ch} -> ${argv.program} (${label})`)
  out.close()
}

function cmdCc(argv) {
  const { out, name } = openOutput(argv.port)
  out.send('cc', { controller: argv.number, value: argv.value, channel: argv.ch - 1 })
  console.log(`${name}: cc ${argv.number} = ${argv.value} ch${argv.ch}`)
  out.close()
}

function cmdPanic(argv) {
  const { out, name } = openOutput(argv.port)
  allNotesOff(out)
  console.log(`${name}: panic — all sound/notes off`)
  out.close()
}

// --------------------------------------------------------------------------
//  Playlist player
// --------------------------------------------------------------------------
function collectFiles(paths, recursive) {
  const isMidi = (p) => MIDI_EXTS.includes(extname(p).toLowerCase())
  const out = []
  for (const raw of paths) {
    const p = resolveLib(raw)
    let st
    try { st = statSync(p) } catch { console.error('skip (not found):', raw); continue }
    if (st.isDirectory()) {
      const walk = (dir) => {
        for (const nm of readdirSync(dir).sort()) {
          const full = join(dir, nm)
          const s = statSync(full)
          if (s.isDirectory()) { if (recursive) walk(full) }
          else if (isMidi(full)) out.push(full)
        }
      }
      walk(p)
    } else {
      out.push(p)  // explicit file (let the parser try even odd extensions)
    }
  }
  return [...new Set(out)]
}

// Flatten a parsed MIDI file into a time-sorted list of send actions.
function buildEvents(out, path, forceCh) {
  const midi = new Midi(readFileSync(path))
  const events = []
  for (const track of midi.tracks) {
    const ch = forceCh != null ? forceCh - 1 : track.channel
    if (track.instrument && Number.isInteger(track.instrument.number)) {
      events.push({ t: 0, fn: () => out.send('program', { number: track.instrument.number, channel: ch }) })
    }
    for (const n of track.notes) {
      const vel = Math.max(1, Math.round(n.velocity * 127))
      events.push({ t: n.time, fn: () => out.send('noteon', { note: n.midi, velocity: vel, channel: ch }) })
      events.push({ t: n.time + n.duration, fn: () => out.send('noteoff', { note: n.midi, velocity: 0, channel: ch }) })
    }
    for (const num of Object.keys(track.controlChanges)) {
      for (const c of track.controlChanges[num]) {
        events.push({ t: c.time, fn: () => out.send('cc', { controller: c.number, value: Math.round(c.value * 127), channel: ch }) })
      }
    }
    for (const pb of track.pitchBends) {
      const value = Math.round(((pb.value + 1) / 2) * 16383)
      events.push({ t: pb.time, fn: () => out.send('pitch', { value, channel: ch }) })
    }
  }
  events.sort((a, b) => a.t - b.t)
  return { events, duration: midi.duration }
}

function makeKeys() {
  if (!process.stdin.isTTY) return null
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  const em = new EventEmitter()
  const handler = (str, key) => {
    if (key && key.ctrl && key.name === 'c') { em.emit('key', 'q'); return }
    em.emit('key', str)
  }
  process.stdin.on('keypress', handler)
  em.close = () => {
    process.stdin.off('keypress', handler)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.pause()
  }
  return em
}

// Returns 'next' | 'prev' | 'quit' | 'done'.
function playOne(out, path, forceCh, keys) {
  let info
  try { info = buildEvents(out, path, forceCh) }
  catch (e) { console.error(`   ! skip (${e.message})`); return Promise.resolve('next') }

  process.stdout.write(`▶  ${basename(path)}  (~${info.duration.toFixed(0)}s)\n`)
  return new Promise((resolve) => {
    const { events } = info
    let idx = 0
    let start = performance.now()
    let paused = false
    let pauseAt = 0

    const finish = (action) => {
      clearInterval(timer)
      if (keys) keys.off('key', onKey)
      resolve(action)
    }
    const onKey = (k) => {
      if (k === 'n') finish('next')
      else if (k === 'p') finish('prev')
      else if (k === 'q') finish('quit')
      else if (k === ' ') {
        if (!paused) { paused = true; pauseAt = performance.now(); allNotesOff(out); process.stdout.write('   ⏸  paused\n') }
        else { paused = false; start += performance.now() - pauseAt; process.stdout.write('   ▶  resumed\n') }
      }
    }
    if (keys) keys.on('key', onKey)

    const timer = setInterval(() => {
      if (paused) return
      const elapsed = (performance.now() - start) / 1000
      while (idx < events.length && events[idx].t <= elapsed) {
        try { events[idx].fn() } catch { /* ignore a bad event */ }
        idx++
      }
      if (idx >= events.length) finish('done')
    }, 4)
  })
}

async function cmdPlay(argv) {
  let files = collectFiles(argv.paths, argv.recursive)
  if (files.length === 0) { console.error('No MIDI files found.'); process.exit(1) }
  if (argv.shuffle) files.sort(() => Math.random() - 0.5)

  const { out, name } = openOutput(argv.port)
  const keys = makeKeys()
  console.log(`${name}: ${files.length} track(s).`
    + (keys ? '  controls: n=next p=prev space=pause q=quit' : '  (non-interactive)'))

  const cleanup = () => { allNotesOff(out); if (keys) keys.close(); out.close() }
  process.on('SIGINT', () => { console.log('\nstopped.'); cleanup(); process.exit(0) })

  let i = 0
  while (i >= 0 && i < files.length) {
    process.stdout.write(`[${i + 1}/${files.length}] `)
    const action = await playOne(out, files[i], argv.ch, keys) // eslint-disable-line no-await-in-loop
    allNotesOff(out)
    if (action === 'quit') break
    i = action === 'prev' ? Math.max(0, i - 1) : i + 1
    if (i >= files.length && argv.loop) i = 0
  }
  cleanup()
}

// --------------------------------------------------------------------------
//  Web player + visualizer (opl serve)
//  Playback runs here (any easymidi output device); the browser is a themed UI
//  fed live MIDI events over Server-Sent Events.
// --------------------------------------------------------------------------

// Flatten a .mid into plain data events (no closures) for the engine + viz.
function buildEventList(path, forceCh) {
  const midi = new Midi(readFileSync(path))
  const events = []
  for (const track of midi.tracks) {
    const ch = forceCh != null ? forceCh - 1 : track.channel
    if (track.instrument && Number.isInteger(track.instrument.number)) {
      events.push({ t: 0, k: 'program', c: ch, a: track.instrument.number, b: 0 })
    }
    for (const n of track.notes) {
      const vel = Math.max(1, Math.round(n.velocity * 127))
      events.push({ t: n.time, k: 'on', c: ch, a: n.midi, b: vel })
      events.push({ t: n.time + n.duration, k: 'off', c: ch, a: n.midi, b: 0 })
    }
    for (const num of Object.keys(track.controlChanges)) {
      for (const cc of track.controlChanges[num]) {
        events.push({ t: cc.time, k: 'cc', c: ch, a: cc.number, b: Math.round(cc.value * 127) })
      }
    }
    for (const pb of track.pitchBends) {
      events.push({ t: pb.time, k: 'pitch', c: ch, a: Math.round(((pb.value + 1) / 2) * 16383), b: 0 })
    }
  }
  events.sort((x, y) => x.t - y.t)
  return { events, duration: midi.duration }
}

function sendRaw(out, ev) {
  switch (ev.k) {
    case 'on': out.send('noteon', { note: ev.a, velocity: ev.b, channel: ev.c }); break
    case 'off': out.send('noteoff', { note: ev.a, velocity: 0, channel: ev.c }); break
    case 'cc': out.send('cc', { controller: ev.a, value: ev.b, channel: ev.c }); break
    case 'pitch': out.send('pitch', { value: ev.a, channel: ev.c }); break
    case 'program': out.send('program', { number: ev.a, channel: ev.c }); break
  }
}

class Engine {
  constructor() {
    this.out = null
    this.deviceName = null
    this.playlist = []
    this.index = -1
    this.events = []
    this.duration = 0
    this.evIndex = 0
    this.playing = false
    this.elapsed = 0
    this.lastTick = 0
    this.lastPos = 0
    this.clients = new Set()
    this.single = false
    this.artPath = null
    this.theme = 'green'
    this.title = 'OPL · MIDI PLAYER'
    this.timer = setInterval(() => this.tick(), 5)
  }

  setPlaylist(files) {
    this.playlist = files.map((f) => ({ path: f, name: basename(f), folder: basename(dirname(f)) }))
  }

  selectDevice(name) {
    if (this.out) { try { this.allNotesOff(); this.out.close() } catch { /* ignore */ } this.out = null }
    const outs = easymidi.getOutputs()
    const found = outs.find((n) => n === name) || outs.find((n) => n.toLowerCase().includes((name || '').toLowerCase()))
    if (found) { this.out = new easymidi.Output(found); this.deviceName = found }
    this.broadcastState()
  }

  load(i) {
    if (i < 0 || i >= this.playlist.length) return
    this.allNotesOff()
    this.index = i
    try { const r = buildEventList(this.playlist[i].path); this.events = r.events; this.duration = r.duration }
    catch { this.events = []; this.duration = 0 }
    this.evIndex = 0
    this.elapsed = 0
    this.broadcast({ type: 'reset' })
    this.broadcastState()
  }

  play() { if (this.out && this.events.length) { this.playing = true; this.lastTick = performance.now(); this.broadcastState() } }
  pause() { this.playing = false; this.allNotesOff(); this.broadcast({ type: 'reset' }); this.broadcastState() }
  stop() { this.playing = false; this.evIndex = 0; this.elapsed = 0; this.allNotesOff(); this.broadcast({ type: 'reset' }); this.broadcastState() }
  next() { if (this.playlist.length === 0) return; if (this.single) { this.stop(); return } this.load((this.index + 1) % this.playlist.length); this.play() }
  prev() { this.load(this.index > 0 ? this.index - 1 : 0); this.play() }

  allNotesOff() {
    if (!this.out) return
    for (let c = 0; c < 16; c++) {
      this.out.send('cc', { controller: 120, value: 0, channel: c })
      this.out.send('cc', { controller: 123, value: 0, channel: c })
    }
  }

  tick() {
    if (!this.playing) return
    const now = performance.now()
    this.elapsed += (now - this.lastTick) / 1000
    this.lastTick = now
    while (this.evIndex < this.events.length && this.events[this.evIndex].t <= this.elapsed) {
      const ev = this.events[this.evIndex++]
      if (this.out) sendRaw(this.out, ev)
      if (ev.k === 'on' || ev.k === 'off' || ev.k === 'cc') this.broadcast({ type: 'ev', k: ev.k, c: ev.c, a: ev.a, b: ev.b })
    }
    if (now - this.lastPos > 100) { this.lastPos = now; this.broadcast({ type: 'pos', t: this.elapsed, d: this.duration }) }
    if (this.evIndex >= this.events.length) this.next()
  }

  state() {
    return {
      type: 'state',
      devices: easymidi.getOutputs(),
      device: this.deviceName,
      playlist: this.playlist.map((p, i) => ({ i, name: p.name, folder: p.folder })),
      index: this.index,
      playing: this.playing,
      duration: this.duration,
      position: this.elapsed,
    }
  }

  broadcastState() { this.broadcast(this.state()) }
  broadcast(obj) {
    const s = `data: ${JSON.stringify(obj)}\n\n`
    for (const res of this.clients) { try { res.write(s) } catch { /* ignore */ } }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function contentType(f) {
  if (f.endsWith('.html')) return 'text/html; charset=utf-8'
  if (f.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (f.endsWith('.css')) return 'text/css; charset=utf-8'
  if (f.endsWith('.png')) return 'image/png'
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) return 'image/jpeg'
  if (f.endsWith('.gif')) return 'image/gif'
  if (f.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

function createServer(engine, port) {
  const webDir = join(dirname(fileURLToPath(import.meta.url)), 'web')
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost')
    if (u.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write('\n')
      engine.clients.add(res)
      res.write(`data: ${JSON.stringify(engine.state())}\n\n`)
      req.on('close', () => engine.clients.delete(res))
      return
    }
    if (u.pathname === '/api' && req.method === 'POST') {
      let body = ''
      req.on('data', (d) => { body += d })
      req.on('end', () => {
        let m = {}
        try { m = JSON.parse(body) } catch { /* ignore */ }
        const fns = { device: () => engine.selectDevice(m.name), load: () => engine.load(m.index), play: () => engine.play(), pause: () => engine.pause(), next: () => engine.next(), prev: () => engine.prev(), stop: () => engine.stop() }
        if (fns[m.action]) fns[m.action]()
        res.writeHead(200); res.end('ok')
      })
      return
    }
    if (u.pathname === '/art' && engine.artPath) {
      try { const data = readFileSync(engine.artPath); res.writeHead(200, { 'Content-Type': contentType(engine.artPath) }); res.end(data) }
      catch { res.writeHead(404); res.end() }
      return
    }
    const file = join(webDir, u.pathname === '/' ? '/index.html' : u.pathname)
    if (!file.startsWith(webDir)) { res.writeHead(403); res.end(); return }
    let data
    try { data = readFileSync(file) } catch { res.writeHead(404); res.end('not found'); return }
    if (file.endsWith('.html')) {
      // Inject the selected theme (data-theme drives CSS with no flash) and the
      // configurable app title (replaces the {{TITLE}} placeholder in the pages).
      data = Buffer.from(String(data)
        .replace('<html lang="en">', `<html lang="en" data-theme="${engine.theme || 'green'}">`)
        .replaceAll('{{TITLE}}', escapeHtml(engine.title || 'OPL · MIDI PLAYER')))
    }
    res.writeHead(200, { 'Content-Type': contentType(file) })
    res.end(data)
  })
  server.listen(port)
  return server
}

function cmdServe(argv) {
  const engine = new Engine()
  engine.theme = argv.theme || process.env.OPL_THEME || 'green'
  engine.title = argv.title || process.env.OPL_TITLE || engine.title
  const folder = resolveLib(argv.folder || process.cwd())
  const files = collectFiles([folder], argv.recursive)
  engine.setPlaylist(files)
  const outs = easymidi.getOutputs()
  if (outs.length) engine.selectDevice(outs.find((n) => n.toLowerCase().includes('opl3')) || outs[0])
  if (files.length) engine.load(0)

  createServer(engine, argv.http)
  console.log(`opl web player:  http://localhost:${argv.http}`)
  console.log(`folder: ${folder}  (${files.length} tracks)   device: ${engine.deviceName || 'none'}`)
  console.log('Ctrl-C to stop.')

  process.on('SIGINT', () => { engine.allNotesOff(); process.exit(0) })
}

// --------------------------------------------------------------------------
//  opl render — headless video renderer
//  Plays a MIDI file, records audio from a system input device, captures the
//  web visualizer via headless Playwright, and muxes into an MP4 video.
// --------------------------------------------------------------------------

const RATIOS = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1':  { w: 1080, h: 1080 },
  '4:5':  { w: 1080, h: 1350 },
}

function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, () => { const port = srv.address().port; srv.close(() => resolve(port)) })
  })
}

// Audio capture uses audify (RtAudio -> CoreAudio). ffmpeg's avfoundation
// indev drops ~6-10% of samples on this hardware; RtAudio captures cleanly.
function findInputDevice(name) {
  const rt = new RtAudio()
  const devs = rt.getDevices().filter((d) => d.inputChannels > 0)
  const lc = (name || '').toLowerCase()
  return devs.find((d) => d.name === name) || devs.find((d) => d.name.toLowerCase().includes(lc)) || null
}

function writeWav(path, pcm, sampleRate, channels) {
  const bps = 16, blockAlign = channels * bps / 8
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20)
  h.writeUInt16LE(channels, 22); h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * blockAlign, 28); h.writeUInt16LE(blockAlign, 32)
  h.writeUInt16LE(bps, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  writeFileSync(path, Buffer.concat([h, pcm]))
}

// Open an RtAudio input stream and start collecting PCM. `channels` is an
// optional "5,6"-style pair of 1-based inputs to capture as stereo; otherwise
// the first two channels are used. Returns { deviceName, stop() } where stop()
// writes the WAV and returns the captured frame count.
function startAudioCapture({ device, channels, rate, outFile }) {
  const dev = findInputDevice(device)
  if (!dev) throw new Error(`Audio input device not found: ${device}`)
  let firstChannel = 0
  if (channels) firstChannel = Math.min(...channels.split(',').map((n) => parseInt(n, 10) - 1))
  const nChannels = Math.min(2, dev.inputChannels - firstChannel)
  const rt = new RtAudio()
  const chunks = []
  rt.openStream(
    null,
    { deviceId: dev.id, nChannels, firstChannel },
    RtAudioFormat.RTAUDIO_SINT16,
    rate, 1920, 'opl-render',
    (buf) => chunks.push(Buffer.from(buf)),
    null,
  )
  rt.start()
  return {
    deviceName: dev.name,
    stop() {
      try { rt.stop() } catch { /* ignore */ }
      try { rt.closeStream() } catch { /* ignore */ }
      const pcm = Buffer.concat(chunks)
      writeWav(outFile, pcm, rate, nChannels)
      return pcm.length / 2 / nChannels
    },
  }
}

async function listAudioDevices() {
  const rt = new RtAudio()
  console.log('Audio input devices:\n')
  for (const d of rt.getDevices()) {
    if (d.inputChannels > 0) console.log(`  [${d.inputChannels}ch]  ${d.name}`)
  }
  console.log('\nPass the device name to --audio-device, and --audio-channels "5,6" to pick a stereo pair.')
}

// Resolve shared render options once (used across all render modes)
async function resolveRenderOpts(argv) {
  let dims
  if (argv.resolution) {
    const parts = argv.resolution.split('x').map(Number)
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      console.error('Invalid --resolution. Use WxH, e.g. 1280x720.')
      process.exit(1)
    }
    dims = { w: parts[0], h: parts[1] }
  } else {
    dims = RATIOS[argv.ratio] || RATIOS['16:9']
  }

  const audioDevice = argv.audioDevice || process.env.OPL_AUDIO_DEVICE
  if (!audioDevice) {
    console.error('No audio device specified. Use --audio-device, set OPL_AUDIO_DEVICE in .env, or try --list-audio.')
    process.exit(1)
  }
  const audioChannels = argv.audioChannels || process.env.OPL_AUDIO_CHANNELS || null
  const audioRate = Number(argv.audioRate || process.env.OPL_AUDIO_RATE || 48000)

  const outs = easymidi.getOutputs()
  if (outs.length === 0) { console.error('No MIDI output ports found.'); process.exit(1) }
  const midiMatch = argv.device || process.env.OPL_MIDI_DEVICE
  const devName = midiMatch
    ? (outs.find((n) => n === midiMatch) || outs.find((n) => n.toLowerCase().includes(midiMatch.toLowerCase())))
    : (outs.find((n) => n.toLowerCase().includes('opl3')) || outs[0])

  let chromium
  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    console.error('Playwright is required for `opl render`. Install it:')
    console.error('  cd tools/midi && npm install playwright && npx playwright install chromium')
    process.exit(1)
  }

  return { dims, audioDevice, audioChannels, audioRate, devName, chromium }
}

// One full render pipeline: engine + server + headless browser + ffmpeg audio + mux.
async function renderSession({ playlist, singleMode, totalDuration, outPath, label, argv, opts }) {
  const { dims, audioDevice, audioChannels, audioRate, devName, chromium } = opts

  const engine = new Engine()
  engine.single = singleMode
  engine.theme = argv.theme || process.env.OPL_THEME || 'green'
  engine.title = argv.title || process.env.OPL_TITLE || engine.title
  engine.setPlaylist(playlist)
  if (argv.art) {
    if (argv.art.startsWith('http')) {
      console.error('URL-based art is not yet supported. Use a local file path for --art.')
      process.exit(1)
    }
    try { statSync(argv.art); engine.artPath = argv.art }
    catch { console.error(`Art file not found: ${argv.art}`); process.exit(1) }
  }
  if (devName) engine.selectDevice(devName)
  engine.load(0)

  const port = await getFreePort()
  const server = createServer(engine, port)
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'opl-render-'))
  const audioFile = join(tmpDir, 'audio.wav')

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return; cleaned = true
    try { clearInterval(engine.timer) } catch { /* ignore */ }
    try { engine.allNotesOff() } catch { /* ignore */ }
    // Closing the MIDI port releases the CoreMIDI handle that keeps the
    // libuv event loop alive — without this the process hangs after "Done:".
    try { if (engine.out) { engine.out.close(); engine.out = null } } catch { /* ignore */ }
    try { server.close() } catch { /* ignore */ }
  }

  console.log(`\nRendering: ${label}  (${totalDuration.toFixed(1)}s)`)
  console.log(`Resolution: ${dims.w}x${dims.h}  Audio: ${audioDevice}${audioChannels ? ` ch${audioChannels}` : ''} @ ${audioRate}Hz  MIDI: ${devName}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: dims.w, height: dims.h },
    recordVideo: { dir: tmpDir, size: { width: dims.w, height: dims.h } },
  })
  const page = await context.newPage()

  await page.goto(`http://localhost:${port}/render.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const el = document.getElementById('track-name')
    return el && el.textContent && el.textContent.trim().length > 0 && el.textContent.trim() !== '\u2014'
  }, { timeout: 5000 }).catch(() => {})

  // Start audio recording via audify (RtAudio -> CoreAudio).
  const recDur = totalDuration + 0.5
  let cap
  try {
    cap = startAudioCapture({ device: audioDevice, channels: audioChannels, rate: audioRate, outFile: audioFile })
  } catch (e) {
    console.error(e.message); cleanup(); process.exit(1)
  }

  await sleep(300)
  engine.play()

  await sleep(recDur * 1000)
  engine.stop()
  const frames = cap.stop()
  console.log(`Capture complete (${(frames / audioRate).toFixed(1)}s audio). Finalizing...`)

  await context.close()
  await browser.close()

  const webmFiles = readdirSync(tmpDir).filter((f) => f.endsWith('.webm'))
  if (webmFiles.length === 0) { console.error('No video file created.'); cleanup(); process.exit(1) }
  const videoFile = join(tmpDir, webmFiles[0])

  try { statSync(audioFile) } catch {
    console.error('Audio recording failed: no audio file written.')
    cleanup(); process.exit(1)
  }

  console.log('Encoding final video...')
  const muxArgs = [
    '-i', videoFile, '-i', audioFile,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    // -r AFTER the inputs is an output option: ffmpeg keeps the webm's real
    // (variable-rate) timestamps and resamples to constant fps, preserving
    // duration. Before -i it would force-reinterpret the VFR webm as Nfps and
    // compress the timeline (~20% fast). -shortest trims to the audio length.
    '-r', String(argv.fps),
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    '-y', outPath,
  ]
  await new Promise((resolve) => {
    spawn('ffmpeg', muxArgs, { stdio: ['ignore', 'inherit', 'inherit'] }).on('close', resolve)
  })

  cleanup()
  if (!argv.keepTemps) { try { rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ } }
  else { console.log(`Temp files: ${tmpDir}`) }

  console.log(`Done: ${outPath}`)
  return outPath
}

async function cmdRender(argv) {
  if (argv.listAudio) { await listAudioDevices(); return }

  // Resolve paths (file(s) or folder(s))
  const paths = argv.paths || []
  if (paths.length === 0) {
    console.error('No files specified. Usage: opl render <file.mid | folder> [options]')
    process.exit(1)
  }
  const files = collectFiles(paths.map(resolveLib), argv.recursive)
  if (files.length === 0) { console.error('No MIDI files found.'); process.exit(1) }

  const opts = await resolveRenderOpts(argv)
  const tag = argv.resolution ? `${opts.dims.w}x${opts.dims.h}` : argv.ratio.replace(':', 'x')

  // --- Album mode: all tracks as one continuous video ---
  if (argv.album && files.length > 1) {
    let totalDuration = argv.tail
    for (const f of files) {
      const midi = new Midi(readFileSync(f))
      totalDuration += midi.duration
    }
    console.log(`Album: ${files.length} tracks, ${totalDuration.toFixed(1)}s total`)
    const outPath = argv.output || join(process.cwd(), `album.${tag}.mp4`)
    await renderSession({
      playlist: files, singleMode: false, totalDuration, outPath,
      label: `${files.length} tracks (album)`, argv, opts,
    })
    process.exit(0)
  }

  // --- Single file ---
  if (files.length === 1) {
    const midi = new Midi(readFileSync(files[0]))
    const totalDuration = midi.duration + argv.tail
    const outPath = argv.output || join(process.cwd(), `${basename(files[0], extname(files[0]))}.${tag}.mp4`)
    await renderSession({
      playlist: [files[0]], singleMode: true, totalDuration, outPath,
      label: basename(files[0]), argv, opts,
    })
    process.exit(0)
  }

  // --- Batch mode: one video per file ---
  console.log(`Batch: ${files.length} files`)
  for (let i = 0; i < files.length; i++) {
    console.log(`\n[${i + 1}/${files.length}]`)
    try {
      const midi = new Midi(readFileSync(files[i]))
      const totalDuration = midi.duration + argv.tail
      const outPath = join(process.cwd(), `${basename(files[i], extname(files[i]))}.${tag}.mp4`)
      await renderSession({
        playlist: [files[i]], singleMode: true, totalDuration, outPath,
        label: basename(files[i]), argv, opts,
      })
    } catch (e) {
      console.error(`  Error: ${e.message}`)
    }
  }
  // audify's RtAudio holds a CoreAudio handle with no release API that keeps
  // the event loop alive; exit explicitly now that all renders are done.
  process.exit(0)
}

// --------------------------------------------------------------------------
yargs(hideBin(process.argv))
  .scriptName('opl')
  .usage('$0 <command> [options]')
  .option('port', { type: 'string', describe: 'output port name substring (default: OPL3Duo)' })
  .command('list', 'list MIDI output ports', () => {}, cmdList)
  .command('note <note>', 'play a single note', (y) => y
    .positional('note', { type: 'number', describe: 'MIDI note (60 = middle C)' })
    .option('vel', { type: 'number', default: 100 })
    .option('dur', { type: 'number', default: 0.5, describe: 'seconds' })
    .option('ch', { type: 'number', default: 1, describe: 'MIDI channel 1-16' }), cmdNote)
  .command('chord <notes..>', 'play notes together', (y) => y
    .positional('notes', { type: 'number' })
    .option('vel', { type: 'number', default: 100 })
    .option('dur', { type: 'number', default: 1 })
    .option('ch', { type: 'number', default: 1 }), cmdChord)
  .command('scale', 'play a major scale', (y) => y
    .option('root', { type: 'number', default: 60 })
    .option('vel', { type: 'number', default: 100 })
    .option('dur', { type: 'number', default: 0.25 })
    .option('ch', { type: 'number', default: 1 }), cmdScale)
  .command('pc <program>', 'program change (GM patch 0-127)', (y) => y
    .positional('program', { type: 'number' })
    .option('ch', { type: 'number', default: 1 }), cmdPc)
  .command('cc <number> <value>', 'send a control change', (y) => y
    .positional('number', { type: 'number', describe: 'CC number 0-127' })
    .positional('value', { type: 'number', describe: 'value 0-127' })
    .option('ch', { type: 'number', default: 1 }), cmdCc)
  .command('panic', 'silence all stuck notes', () => {}, cmdPanic)
  .command('play <paths..>', 'play .mid file(s) or folder(s)', (y) => y
    .positional('paths', { type: 'string' })
    .option('recursive', { alias: 'r', type: 'boolean', default: false })
    .option('shuffle', { type: 'boolean', default: false })
    .option('loop', { type: 'boolean', default: false })
    .option('ch', { type: 'number', describe: 'force all events onto this channel 1-16' }), cmdPlay)
  .command('serve [folder]', 'web player + visualizer; pick any MIDI output device', (y) => y
    .positional('folder', { type: 'string', describe: 'folder of .mid files (default: current dir)' })
    .option('recursive', { alias: 'r', type: 'boolean', default: false })
    .option('http', { type: 'number', default: 7373, describe: 'HTTP port for the web UI' })
    .option('theme', { type: 'string', describe: 'web theme: green (default) or winamp' })
    .option('title', { type: 'string', describe: 'app title shown in the UI (default "OPL · MIDI PLAYER")' }), cmdServe)
  .command('render [paths..]', 'render MIDI file(s) or folder to video (headless)', (y) => y
    .positional('paths', { type: 'string', describe: '.mid file(s) or folder(s)' })
    .option('recursive', { alias: 'r', type: 'boolean', default: false, describe: 'recurse into subfolders' })
    .option('album', { type: 'boolean', default: false, describe: 'render all tracks as one continuous video' })
    .option('audio-device', { type: 'string', describe: 'audio input device name (use --list-audio to see)' })
    .option('audio-channels', { type: 'string', describe: 'capture only these two 1-based input channels as stereo, e.g. "7,8"' })
    .option('audio-rate', { type: 'number', describe: 'audio sample rate (default 48000; match your interface, e.g. 44100)' })
    .option('output', { alias: 'o', type: 'string', describe: 'output video file (.mp4)' })
    .option('ratio', { type: 'string', default: '16:9', choices: ['16:9', '9:16', '1:1', '4:5'], describe: 'aspect ratio preset' })
    .option('resolution', { type: 'string', describe: 'custom resolution WxH (overrides --ratio)' })
    .option('art', { type: 'string', describe: 'path to album art image' })
    .option('tail', { type: 'number', default: 3, describe: 'seconds of tail after last note (default: 3)' })
    .option('device', { type: 'string', describe: 'MIDI output device name substring' })
    .option('port', { type: 'number', describe: 'HTTP port for internal server (default: random)' })
    .option('fps', { type: 'number', default: 30, describe: 'output video framerate' })
    .option('keep-temps', { type: 'boolean', default: false, describe: 'keep temp files (video.webm, audio.wav)' })
    .option('list-audio', { type: 'boolean', default: false, describe: 'list audio input devices and exit' })
    .option('theme', { type: 'string', describe: 'visualizer theme: green (default) or winamp' })
    .option('title', { type: 'string', describe: 'app title shown in the visualizer (default "OPL · MIDI PLAYER")' })
  , cmdRender)
  .demandCommand(1, 'Pick a command (try --help).')
  .strict()
  .help()
  .alias('h', 'help')
  .parse()
