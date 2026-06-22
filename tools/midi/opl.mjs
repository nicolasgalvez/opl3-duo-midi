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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import readline from 'node:readline'
import easymidi from 'easymidi'
import toneMidiPkg from '@tonejs/midi'
import yargs from 'yargs'

const { Midi } = toneMidiPkg

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
  next() { if (this.index + 1 < this.playlist.length) { this.load(this.index + 1); this.play() } else { this.stop() } }
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

function contentType(f) {
  if (f.endsWith('.html')) return 'text/html; charset=utf-8'
  if (f.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (f.endsWith('.css')) return 'text/css; charset=utf-8'
  return 'application/octet-stream'
}

function cmdServe(argv) {
  const engine = new Engine()
  const folder = resolveLib(argv.folder || process.cwd())
  const files = collectFiles([folder], argv.recursive)
  engine.setPlaylist(files)
  const outs = easymidi.getOutputs()
  if (outs.length) engine.selectDevice(outs.find((n) => n.toLowerCase().includes('opl3')) || outs[0])
  if (files.length) engine.load(0)

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
    const file = join(webDir, u.pathname === '/' ? '/index.html' : u.pathname)
    if (!file.startsWith(webDir)) { res.writeHead(403); res.end(); return }
    let data
    try { data = readFileSync(file) } catch { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': contentType(file) })
    res.end(data)
  })
  server.listen(argv.http, () => {
    console.log(`opl web player:  http://localhost:${argv.http}`)
    console.log(`folder: ${folder}  (${files.length} tracks)   device: ${engine.deviceName || 'none'}`)
    console.log('Ctrl-C to stop.')
  })
  process.on('SIGINT', () => { engine.allNotesOff(); process.exit(0) })
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
    .option('http', { type: 'number', default: 7373, describe: 'HTTP port for the web UI' }), cmdServe)
  .demandCommand(1, 'Pick a command (try --help).')
  .strict()
  .help()
  .alias('h', 'help')
  .parse()
