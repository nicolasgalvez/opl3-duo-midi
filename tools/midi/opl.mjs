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
import { readdirSync, readFileSync, writeFileSync, statSync, mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, extname, join, dirname } from 'node:path'
import { loadEnv, resolveLib, MIDI_TOOL_DIR } from './lib/paths.mjs'
import { readMidiData } from './lib/midiFile.mjs'
import { buildControllerResetMessages, buildAllNotesOffMessages, sendMessages } from './lib/midiReset.mjs'
import { isPlaylistFile, loadPlaylist } from './lib/playlist.mjs'
import { toM3U, toJSPF } from './lib/playlistWrite.mjs'
import { removeTrack as removeTrackPure, moveTrack as moveTrackPure } from './lib/playlistEdit.mjs'
import { openLibrary } from './lib/library.mjs'
import { resolveConfig, validateConfig } from './lib/config.mjs'
import { resolveLayout } from './lib/layout.mjs'
import { resolveDimensions } from './lib/presets.mjs'
import {
  connectObs,
  resolveObsOpts,
  setBrowserSourceUrl,
  startObsRecording,
  stopObsRecording,
  waitForFile,
  waitForObsRecording,
} from './lib/obs.mjs'
import { buildMuxArgs, resolveAvOffset } from './lib/mux.mjs'
import { nextPlaylistIndex, prevPlaylistIndex, shuffleOrder } from './lib/playback.mjs'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import { spawn, execSync } from 'node:child_process'
import readline from 'node:readline'
import easymidi from 'easymidi'
import toneMidiPkg from '@tonejs/midi'
import audify from 'audify'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const { Midi } = toneMidiPkg
const { RtAudio, RtAudioFormat } = audify

loadEnv()

const DEFAULT_PORT_MATCH = 'OPL3Duo'
const MIDI_EXTS = ['.mid', '.midi']

const GM_NAMES = [
  'Acoustic Grand Piano',
  'Bright Acoustic Piano',
  'Electric Grand Piano',
  'Honky-tonk Piano',
  'Electric Piano 1',
  'Electric Piano 2',
  'Harpsichord',
  'Clavinet',
  'Celesta',
  'Glockenspiel',
  'Music Box',
  'Vibraphone',
  'Marimba',
  'Xylophone',
  'Tubular Bells',
  'Dulcimer',
  'Drawbar Organ',
  'Percussive Organ',
  'Rock Organ',
  'Church Organ',
  'Reed Organ',
  'Accordion',
  'Harmonica',
  'Tango Accordion',
  'Acoustic Guitar (nylon)',
  'Acoustic Guitar (steel)',
  'Electric Guitar (jazz)',
  'Electric Guitar (clean)',
  'Electric Guitar (muted)',
  'Overdriven Guitar',
  'Distortion Guitar',
  'Guitar Harmonics',
  'Acoustic Bass',
  'Electric Bass (finger)',
  'Electric Bass (pick)',
  'Fretless Bass',
  'Slap Bass 1',
  'Slap Bass 2',
  'Synth Bass 1',
  'Synth Bass 2',
  'Violin',
  'Viola',
  'Cello',
  'Contrabass',
  'Tremolo Strings',
  'Pizzicato Strings',
  'Orchestral Harp',
  'Timpani',
  'String Ensemble 1',
  'String Ensemble 2',
  'Synth Strings 1',
  'Synth Strings 2',
  'Choir Aahs',
  'Voice Oohs',
  'Synth Voice',
  'Orchestra Hit',
  'Trumpet',
  'Trombone',
  'Tuba',
  'Muted Trumpet',
  'French Horn',
  'Brass Section',
  'Synth Brass 1',
  'Synth Brass 2',
  'Soprano Sax',
  'Alto Sax',
  'Tenor Sax',
  'Baritone Sax',
  'Oboe',
  'English Horn',
  'Bassoon',
  'Clarinet',
  'Piccolo',
  'Flute',
  'Recorder',
  'Pan Flute',
  'Blown Bottle',
  'Shakuhachi',
  'Whistle',
  'Ocarina',
  'Lead 1 (square)',
  'Lead 2 (sawtooth)',
  'Lead 3 (calliope)',
  'Lead 4 (chiff)',
  'Lead 5 (charang)',
  'Lead 6 (voice)',
  'Lead 7 (fifths)',
  'Lead 8 (bass + lead)',
  'Pad 1 (new age)',
  'Pad 2 (warm)',
  'Pad 3 (polysynth)',
  'Pad 4 (choir)',
  'Pad 5 (bowed)',
  'Pad 6 (metallic)',
  'Pad 7 (halo)',
  'Pad 8 (sweep)',
  'FX 1 (rain)',
  'FX 2 (soundtrack)',
  'FX 3 (crystal)',
  'FX 4 (atmosphere)',
  'FX 5 (brightness)',
  'FX 6 (goblins)',
  'FX 7 (echoes)',
  'FX 8 (sci-fi)',
  'Sitar',
  'Banjo',
  'Shamisen',
  'Koto',
  'Kalimba',
  'Bagpipe',
  'Fiddle',
  'Shanai',
  'Tinkle Bell',
  'Agogo',
  'Steel Drums',
  'Woodblock',
  'Taiko Drum',
  'Melodic Tom',
  'Synth Drum',
  'Reverse Cymbal',
  'Guitar Fret Noise',
  'Breath Noise',
  'Seashore',
  'Bird Tweet',
  'Telephone Ring',
  'Helicopter',
  'Applause',
  'Gunshot',
]

// --------------------------------------------------------------------------
function resolvePort(requested) {
  const names = midiOutputs()
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
  sendMessages(out, buildAllNotesOffMessages())
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --------------------------------------------------------------------------
//  Simple commands
// --------------------------------------------------------------------------
function cmdList() {
  console.log('MIDI outputs:')
  for (const n of midiOutputs()) console.log('  -', n)
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
function arr(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v]
}

// MIDI output enumeration that never throws: on a host with no MIDI subsystem
// (e.g. a CI runner, or a headless box with no ALSA sequencer) easymidi throws,
// which must not crash `opl serve` — the visualizer / SoundFont output still work.
function midiOutputs() {
  try {
    return easymidi.getOutputs()
  } catch {
    return []
  }
}

function collectFiles(paths, recursive) {
  const isMidi = (p) => MIDI_EXTS.includes(extname(p).toLowerCase())
  const out = []
  for (const raw of paths) {
    const p = resolveLib(raw)
    let st
    try {
      st = statSync(p)
    } catch {
      console.error('skip (not found):', raw)
      continue
    }
    if (st.isDirectory()) {
      const walk = (dir) => {
        for (const nm of readdirSync(dir).sort()) {
          const full = join(dir, nm)
          const s = statSync(full)
          if (s.isDirectory()) {
            if (recursive) walk(full)
          } else if (isMidi(full)) out.push(full)
        }
      }
      walk(p)
    } else if (isPlaylistFile(p)) {
      out.push(...loadPlaylist(p)) // .m3u/.m3u8/.jspf — expand to its tracks, in order
    } else {
      out.push(p) // explicit file (let the parser try even odd extensions)
    }
  }
  return [...new Set(out)]
}

// Flatten a parsed MIDI file into a time-sorted list of send actions.
function buildEvents(out, path, forceCh) {
  const midi = new Midi(readMidiData(path))
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
        events.push({
          t: c.time,
          fn: () => out.send('cc', { controller: c.number, value: Math.round(c.value * 127), channel: ch }),
        })
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
    if (key && key.ctrl && key.name === 'c') {
      em.emit('key', 'q')
      return
    }
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
  try {
    info = buildEvents(out, path, forceCh)
  } catch (e) {
    console.error(`   ! skip (${e.message})`)
    return Promise.resolve('next')
  }

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
        if (!paused) {
          paused = true
          pauseAt = performance.now()
          sendMessages(out, buildControllerResetMessages())
          process.stdout.write('   ⏸  paused\n')
        } else {
          paused = false
          start += performance.now() - pauseAt
          process.stdout.write('   ▶  resumed\n')
        }
      }
    }
    if (keys) keys.on('key', onKey)

    const timer = setInterval(() => {
      if (paused) return
      const elapsed = (performance.now() - start) / 1000
      while (idx < events.length && events[idx].t <= elapsed) {
        try {
          events[idx].fn()
        } catch {
          /* ignore a bad event */
        }
        idx++
      }
      if (idx >= events.length) finish('done')
    }, 4)
  })
}

async function cmdPlay(argv) {
  let files = collectFiles(argv.paths, argv.recursive)
  if (files.length === 0) {
    console.error('No MIDI files found.')
    process.exit(1)
  }
  if (argv.shuffle) files.sort(() => Math.random() - 0.5)

  const { out, name } = openOutput(argv.port)
  const keys = makeKeys()
  console.log(
    `${name}: ${files.length} track(s).` +
      (keys ? '  controls: n=next p=prev space=pause q=quit' : '  (non-interactive)'),
  )

  const cleanup = () => {
    allNotesOff(out)
    if (keys) keys.close()
    out.close()
  }
  process.on('SIGINT', () => {
    console.log('\nstopped.')
    cleanup()
    process.exit(0)
  })

  let i = 0
  while (i >= 0 && i < files.length) {
    process.stdout.write(`[${i + 1}/${files.length}] `)
    const action = await playOne(out, files[i], argv.ch, keys)
    sendMessages(out, buildControllerResetMessages()) // full reset between tracks — mirrors Engine.load()
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
  const midi = new Midi(readMidiData(path))
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
    case 'on':
      out.send('noteon', { note: ev.a, velocity: ev.b, channel: ev.c })
      break
    case 'off':
      out.send('noteoff', { note: ev.a, velocity: 0, channel: ev.c })
      break
    case 'cc':
      out.send('cc', { controller: ev.a, value: ev.b, channel: ev.c })
      break
    case 'pitch':
      out.send('pitch', { value: ev.a, channel: ev.c })
      break
    case 'program':
      out.send('program', { number: ev.a, channel: ev.c })
      break
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
    this.repeat = false
    this.shuffle = false
    this._shuffleOrder = []
    this.artPath = null
    this.library = null
    this.uploadsDir = null
    this.config = null
    this.theme = 'green'
    this.layout = 'normal'
    this.title = 'OPL · MIDI PLAYER'
    this.timer = setInterval(() => this.tick(), 5)
  }

  setPlaylist(files) {
    this.playlist = files.map((f) => ({ path: f, name: basename(f), folder: basename(dirname(f)) }))
    this._shuffleOrder = this.shuffle ? shuffleOrder(this.playlist.length) : []
  }

  // ── File menu: open folders / files / playlists (reuses collectFiles, which
  //    handles .m3u/.jspf playlists from ODM-1 and MIDI_LIBRARY resolution). ──
  openPaths(paths, recursive = false) {
    const list = Array.isArray(paths) ? paths : [paths]
    const files = collectFiles(list.filter(Boolean), recursive)
    this.setPlaylist(files)
    if (files.length) this.load(0)
    else {
      this.index = -1
      this.broadcastState()
    }
  }

  // ── Edit menu: remove / reorder, keeping the playing track under the cursor. ──
  removeTrack(removeIdx) {
    const wasCurrent = removeIdx === this.index
    const { items, current } = removeTrackPure(this.playlist, this.index, removeIdx)
    this.playlist = items
    this._shuffleOrder = this.shuffle ? shuffleOrder(items.length) : []
    if (items.length === 0) {
      this.index = -1
      this.stop()
    } else if (wasCurrent) {
      this.load(current) // a different track now occupies the slot
    } else {
      this.index = current
      this.broadcastState()
    }
  }

  moveTrack(from, to) {
    const { items, current } = moveTrackPure(this.playlist, this.index, from, to)
    this.playlist = items
    this.index = current
    this._shuffleOrder = this.shuffle ? shuffleOrder(items.length) : []
    this.broadcastState() // same track keeps playing; only queue order changed
  }

  // ── File menu: save the current queue as .m3u or .jspf. ──
  savePlaylist(path, format) {
    try {
      const paths = this.playlist.map((p) => p.path)
      const fmt = format || (String(path).toLowerCase().endsWith('.jspf') ? 'jspf' : 'm3u')
      const body = fmt === 'jspf' ? toJSPF(paths, { title: this.title }) : toM3U(paths)
      writeFileSync(path, body)
      return { ok: true, path, count: paths.length }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  setRepeat(on) {
    this.repeat = !!on
    this.broadcastState()
  }

  setShuffle(on) {
    this.shuffle = !!on
    this._shuffleOrder = this.shuffle ? shuffleOrder(this.playlist.length) : []
    this.broadcastState()
  }

  selectDevice(name) {
    if (this.out) {
      try {
        this.allNotesOff()
        this.out.close()
      } catch {
        /* ignore */
      }
      this.out = null
    }
    const outs = midiOutputs()
    const found = outs.find((n) => n === name) || outs.find((n) => n.toLowerCase().includes((name || '').toLowerCase()))
    if (found) {
      this.out = new easymidi.Output(found)
      this.deviceName = found
    }
    this.broadcastState()
  }

  load(i) {
    if (i < 0 || i >= this.playlist.length) return
    this.resetAll()
    this.index = i
    try {
      const r = buildEventList(this.playlist[i].path)
      this.events = r.events
      this.duration = r.duration
    } catch {
      this.events = []
      this.duration = 0
    }
    this.evIndex = 0
    this.elapsed = 0
    this.broadcast({ type: 'reset' })
    this.broadcastState()
  }

  play() {
    if (this.out && this.events.length) {
      this.playing = true
      this.lastTick = performance.now()
      this.broadcastState()
    }
  }
  pause() {
    this.playing = false
    this.resetAll()
    this.broadcast({ type: 'reset' })
    this.broadcastState()
  }
  stop() {
    this.playing = false
    this.evIndex = 0
    this.elapsed = 0
    this.resetAll()
    this.broadcast({ type: 'reset' })
    this.broadcastState()
  }
  next() {
    if (this.playlist.length === 0) return
    if (this.single) {
      this.stop()
      return
    }
    const idx = nextPlaylistIndex({
      index: this.index,
      length: this.playlist.length,
      repeat: this.repeat,
      shuffle: this.shuffle,
      order: this._shuffleOrder,
    })
    if (idx == null) {
      this.stop()
      return
    }
    this.load(idx)
    this.play()
  }
  prev() {
    if (this.playlist.length === 0) return
    const idx = prevPlaylistIndex({
      index: this.index,
      length: this.playlist.length,
      shuffle: this.shuffle,
      order: this._shuffleOrder,
    })
    this.load(idx)
    this.play()
  }

  allNotesOff() {
    if (!this.out) return
    sendMessages(this.out, buildAllNotesOffMessages())
  }

  // Full GM-style reset so controller state (mod wheel, pitch bend, sustain, expression,
  // volume, pan, program) can't bleed from one track into the next in album/playlist mode.
  resetAll() {
    if (!this.out) return
    sendMessages(this.out, buildControllerResetMessages())
  }

  tick() {
    if (!this.playing) return
    const now = performance.now()
    this.elapsed += (now - this.lastTick) / 1000
    this.lastTick = now
    while (this.evIndex < this.events.length && this.events[this.evIndex].t <= this.elapsed) {
      const ev = this.events[this.evIndex++]
      if (this.out) sendRaw(this.out, ev)
      if (ev.k === 'on' || ev.k === 'off' || ev.k === 'cc')
        this.broadcast({ type: 'ev', k: ev.k, c: ev.c, a: ev.a, b: ev.b })
    }
    if (now - this.lastPos > 100) {
      this.lastPos = now
      this.broadcast({ type: 'pos', t: this.elapsed, d: this.duration })
    }
    if (this.evIndex >= this.events.length) this.next()
  }

  state() {
    return {
      type: 'state',
      devices: midiOutputs(),
      device: this.deviceName,
      playlist: this.playlist.map((p, i) => ({ i, name: p.name, folder: p.folder })),
      index: this.index,
      playing: this.playing,
      repeat: this.repeat,
      shuffle: this.shuffle,
      duration: this.duration,
      position: this.elapsed,
    }
  }

  broadcastState() {
    this.broadcast(this.state())
  }
  broadcast(obj) {
    const s = `data: ${JSON.stringify(obj)}\n\n`
    for (const res of this.clients) {
      try {
        res.write(s)
      } catch {
        /* ignore */
      }
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
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

function createServer(engine, port, { useSpa = false } = {}) {
  // Classic static page (web/) is the default. The Web Player v2 SPA
  // (web-app/dist) is opt-in via `--ui v2`; when enabled it is preferred but
  // still falls back to web/ for any path it doesn't own (e.g. /render.html,
  // which the headless renderer always loads from web/).
  const distDir = join(MIDI_TOOL_DIR, 'web-app', 'dist')
  const legacyDir = join(MIDI_TOOL_DIR, 'web')
  const roots = useSpa && existsSync(join(distDir, 'index.html')) ? [distDir, legacyDir] : [legacyDir]
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
      req.on('data', (d) => {
        body += d
      })
      req.on('end', () => {
        let m = {}
        try {
          m = JSON.parse(body)
        } catch {
          /* ignore */
        }
        const fns = {
          device: () => engine.selectDevice(m.name),
          load: () => engine.load(m.index),
          play: () => engine.play(),
          pause: () => engine.pause(),
          next: () => engine.next(),
          prev: () => engine.prev(),
          stop: () => engine.stop(),
          repeat: () => engine.setRepeat(m.on != null ? !!m.on : !engine.repeat),
          shuffle: () => engine.setShuffle(m.on != null ? !!m.on : !engine.shuffle),
          open: () => engine.openPaths(m.paths ?? m.path, !!m.recursive),
          remove: () => engine.removeTrack(m.index),
          reorder: () => engine.moveTrack(m.from, m.to),
          save: () => engine.savePlaylist(m.path, m.format),
        }
        const result = fns[m.action] ? fns[m.action]() : undefined
        if (result && typeof result === 'object') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } else {
          res.writeHead(200)
          res.end('ok')
        }
      })
      return
    }
    if (u.pathname === '/api/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(engine.config ?? {}))
      return
    }
    if (u.pathname === '/api/midi') {
      // Serve a track's raw MIDI bytes so the in-browser SoundFont sequencer
      // (ODM-5) can load and play it client-side.
      const i = Number(u.searchParams.get('index'))
      const track = engine.playlist[Number.isInteger(i) ? i : engine.index]
      if (track) {
        try {
          const data = readFileSync(track.path)
          res.writeHead(200, { 'Content-Type': 'audio/midi' })
          res.end(data)
          return
        } catch {
          /* fall through to 404 */
        }
      }
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (u.pathname === '/api/library/upload' && req.method === 'POST' && engine.library) {
      const chunks = []
      req.on('data', (d) => chunks.push(d))
      req.on('end', async () => {
        try {
          const buf = Buffer.concat(chunks)
          const name = String(req.headers['x-filename'] || 'upload.mid').replace(/[^\w.\- ]/g, '_')
          // Content-addressed: identical bytes hash to the same file, so a
          // re-drop never duplicates on disk or in the library (deduped by path).
          const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16)
          mkdirSync(engine.uploadsDir, { recursive: true })
          const dest = join(engine.uploadsDir, `${hash}-${name}`)
          if (!existsSync(dest)) writeFileSync(dest, buf)
          const entry = await engine.library.add(dest, { addedAt: Date.now() })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, entry }))
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })
      return
    }
    if (u.pathname === '/api/library' && engine.library) {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ entries: engine.library.list(u.searchParams.get('q')) }))
        return
      }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (d) => {
          body += d
        })
        req.on('end', async () => {
          let m = {}
          try {
            m = JSON.parse(body)
          } catch {
            /* ignore */
          }
          let result = { ok: false }
          try {
            if (m.op === 'add') {
              const files = collectFiles(arr(m.paths ?? m.path).filter(Boolean), !!m.recursive)
              const added = await engine.library.addMany(files, { addedAt: Date.now() })
              result = { ok: true, added: added.length, total: engine.library.list().length }
            } else if (m.op === 'remove') {
              result = { ok: await engine.library.remove(m.id) }
            } else if (m.op === 'play') {
              const ids = new Set(arr(m.ids))
              const paths = engine.library
                .list()
                .filter((e) => ids.has(e.id))
                .map((e) => e.path)
              engine.openPaths(paths)
              result = { ok: true, count: paths.length }
            }
          } catch (e) {
            result = { ok: false, error: e.message }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })
        return
      }
    }
    if (u.pathname === '/art' && engine.artPath) {
      try {
        const data = readFileSync(engine.artPath)
        res.writeHead(200, { 'Content-Type': contentType(engine.artPath) })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end()
      }
      return
    }
    const rel = u.pathname === '/' ? '/index.html' : u.pathname
    let data
    let file
    for (const root of roots) {
      const candidate = join(root, rel)
      if (!candidate.startsWith(root)) continue // path-traversal guard
      try {
        data = readFileSync(candidate)
        file = candidate
        break
      } catch {
        /* try the next root */
      }
    }
    if (data == null) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (file.endsWith('.html')) {
      const layout = engine.layout || 'normal'
      const theme = engine.theme || 'green'
      const title = engine.title || 'OPL · MIDI PLAYER'
      data = Buffer.from(
        String(data)
          .replace('<html lang="en">', `<html lang="en" data-theme="${theme}" data-layout="${layout}">`)
          .replaceAll('{{TITLE}}', escapeHtml(title)),
      )
    }
    res.writeHead(200, { 'Content-Type': contentType(file) })
    res.end(data)
  })
  server.listen(port)
  return server
}

// Resolve the requested UI ('classic' default, 'v2' opt-in) and make sure the
// SPA bundle exists. If v2 is requested but unbuilt, try a one-time build; on
// failure, fall back to classic so `opl serve` always shows *something*.
function ensureWebUi(wantV2) {
  if (!wantV2) return false
  const appDir = join(MIDI_TOOL_DIR, 'web-app')
  if (existsSync(join(appDir, 'dist', 'index.html'))) return true
  if (!existsSync(join(appDir, 'node_modules'))) {
    console.error('--ui v2: web-app deps not installed; run `npm install` in tools/midi/web-app. Using classic UI.')
    return false
  }
  try {
    console.log('Building Web Player v2 (first run)…')
    execSync('npm run build', { cwd: appDir, stdio: 'ignore' })
    return existsSync(join(appDir, 'dist', 'index.html'))
  } catch {
    console.error('--ui v2: build failed; using classic UI.')
    return false
  }
}

async function cmdServe(argv) {
  const engine = new Engine()

  // Runtime config (defaults / preset / file), then CLI/env overrides so both
  // the classic page and the v2 SPA (/api/config) see --theme/--layout/--title.
  // Invalid config is fatal.
  try {
    const base = resolveConfig({ preset: argv.preset, file: argv.config || process.env.OPL_CONFIG })
    const ov = {}
    const theme = argv.theme || process.env.OPL_THEME
    const layout = argv.layout || process.env.OPL_LAYOUT
    const title = argv.title || process.env.OPL_TITLE
    if (theme) ov.theme = theme
    if (layout) ov.layout = layout
    if (title) ov.title = title
    engine.config = Object.keys(ov).length ? validateConfig({ ...base, ...ov }) : base
  } catch (e) {
    console.error('config error:', e.message)
    process.exit(1)
  }
  engine.theme = engine.config.theme
  engine.title = engine.config.title
  engine.layout = engine.config.layout
  const folder = resolveLib(argv.folder || process.cwd())
  const files = collectFiles([folder], argv.recursive)
  engine.setPlaylist(files)
  engine.repeat = !!(argv.repeat || argv.loop || process.env.OPL_REPEAT === '1' || process.env.OPL_REPEAT === 'true')
  engine.setShuffle(!!(argv.shuffle || process.env.OPL_SHUFFLE === '1' || process.env.OPL_SHUFFLE === 'true'))
  const outs = midiOutputs()
  if (outs.length) engine.selectDevice(outs.find((n) => n.toLowerCase().includes('opl3')) || outs[0])
  if (files.length) engine.load(0)

  const dbPath = process.env.OPL_LIBRARY_DB || join(MIDI_TOOL_DIR, '.opl-library.json')
  engine.uploadsDir = process.env.OPL_UPLOADS_DIR || join(dirname(dbPath), '.opl-uploads')
  try {
    engine.library = await openLibrary(dbPath)
  } catch (e) {
    console.error('library disabled:', e.message)
  }

  // v2 (the React SPA) is now the default; `--ui classic` opts back to the
  // legacy page. ensureWebUi falls back to classic if the SPA can't be built.
  const ui = (argv.ui || process.env.OPL_UI || 'v2').toLowerCase()
  const useSpa = ensureWebUi(ui !== 'classic')
  createServer(engine, argv.http, { useSpa })
  console.log(`opl web player:  http://localhost:${argv.http}  (UI: ${useSpa ? 'v2' : 'classic'})`)
  console.log(`folder: ${folder}  (${files.length} tracks)   device: ${engine.deviceName || 'none'}`)
  console.log('Ctrl-C to stop.')

  process.on('SIGINT', () => {
    engine.allNotesOff()
    process.exit(0)
  })
}

// --------------------------------------------------------------------------
//  opl render — headless video renderer
//  Plays a MIDI file, records audio from a system input device, captures the
//  web visualizer via headless Playwright, and muxes into an MP4 video.
// --------------------------------------------------------------------------

function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
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
  try {
    dims = resolveDimensions(argv)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }

  const audioDevice = argv.audioDevice || process.env.OPL_AUDIO_DEVICE
  if (!audioDevice) {
    console.error('No audio device specified. Use --audio-device, set OPL_AUDIO_DEVICE in .env, or try --list-audio.')
    process.exit(1)
  }
  const audioChannels = argv.audioChannels || process.env.OPL_AUDIO_CHANNELS || null
  const audioRate = Number(argv.audioRate || process.env.OPL_AUDIO_RATE || 48000)

  const outs = midiOutputs()
  if (outs.length === 0) {
    console.error('No MIDI output ports found.')
    process.exit(1)
  }
  const midiMatch = argv.device || process.env.OPL_MIDI_DEVICE
  const devName = midiMatch
    ? outs.find((n) => n === midiMatch) || outs.find((n) => n.toLowerCase().includes(midiMatch.toLowerCase()))
    : outs.find((n) => n.toLowerCase().includes('opl3')) || outs[0]

  let chromium = null
  const browserPath = argv.browserPath || process.env.OPL_BROWSER_PATH || null
  if (!argv.obs) {
    try {
      const pw = await import('playwright')
      chromium = pw.chromium
    } catch {
      console.error('Playwright is required for `opl render`. Install it:')
      console.error('  npm install && npx playwright install chromium')
      process.exit(1)
    }
  }

  const obsOpts = argv.obs ? resolveObsOpts(argv) : null

  return { dims, audioDevice, audioChannels, audioRate, devName, chromium, browserPath, obsOpts }
}

function createRenderCleanup(engine, server) {
  let cleaned = false
  return () => {
    if (cleaned) return
    cleaned = true
    try {
      clearInterval(engine.timer)
    } catch {
      /* ignore */
    }
    try {
      engine.allNotesOff()
    } catch {
      /* ignore */
    }
    try {
      if (engine.out) {
        engine.out.close()
        engine.out = null
      }
    } catch {
      /* ignore */
    }
    try {
      server.close()
    } catch {
      /* ignore */
    }
  }
}

async function setupRenderEngine({ playlist, singleMode, argv, devName, port }) {
  const engine = new Engine()
  engine.single = singleMode
  engine.repeat = false
  engine.shuffle = false
  engine.theme = argv.theme || process.env.OPL_THEME || 'green'
  engine.title = argv.title || process.env.OPL_TITLE || engine.title
  const layoutArgv = { ...argv }
  if (argv.obs && !argv.layout && !process.env.OPL_LAYOUT) layoutArgv.layout = 'overlay'
  try {
    engine.layout = resolveLayout(layoutArgv)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  engine.setPlaylist(playlist)
  if (argv.art) {
    if (argv.art.startsWith('http')) {
      console.error('URL-based art is not yet supported. Use a local file path for --art.')
      process.exit(1)
    }
    try {
      statSync(argv.art)
      engine.artPath = argv.art
    } catch {
      console.error(`Art file not found: ${argv.art}`)
      process.exit(1)
    }
  }
  if (devName) engine.selectDevice(devName)
  engine.load(0)

  const httpPort = port ?? (argv.port || (await getFreePort()))
  const server = createServer(engine, httpPort)
  return { engine, server, httpPort }
}

async function muxVideoAudio({ videoFile, audioFile, outPath, fps, avOffsetMs = 0 }) {
  const muxArgs = buildMuxArgs({ videoFile, audioFile, outPath, fps, avOffsetMs })
  await new Promise((resolve, reject) => {
    spawn('ffmpeg', muxArgs, { stdio: ['ignore', 'inherit', 'inherit'] }).on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

// One full render pipeline: engine + server + OBS recording + ffmpeg audio + mux.
async function renderSessionObs({ playlist, singleMode, totalDuration, outPath, label, argv, opts }) {
  const { dims, audioDevice, audioChannels, audioRate, devName, obsOpts } = opts

  const { engine, server, httpPort } = await setupRenderEngine({ playlist, singleMode, argv, devName })
  const cleanup = createRenderCleanup(engine, server)
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'opl-render-'))
  const audioFile = join(tmpDir, 'audio.wav')
  const pageUrl = `http://localhost:${httpPort}/render.html`

  let obsConn
  try {
    obsConn = await connectObs(obsOpts)
  } catch (e) {
    console.error(e.message)
    cleanup()
    process.exit(1)
  }
  const { obs, info } = obsConn

  console.log(`\nRendering (OBS): ${label}  (${totalDuration.toFixed(1)}s)`)
  console.log(
    `Resolution: ${dims.w}x${dims.h}  Audio: ${audioDevice}${audioChannels ? ` ch${audioChannels}` : ''} @ ${audioRate}Hz  MIDI: ${devName}`,
  )
  console.log(`OBS: ${info.obsWebSocketVersion || 'connected'} @ ${obsOpts.url}`)
  console.log(`Visualizer: ${pageUrl}`)

  if (obsOpts.source) {
    try {
      await setBrowserSourceUrl(obs, obsOpts.source, pageUrl, dims.w, dims.h)
      console.log(`Browser source "${obsOpts.source}" pointed at visualizer.`)
    } catch (e) {
      console.error(`Could not update browser source "${obsOpts.source}": ${e.message}`)
      cleanup()
      try {
        await obs.disconnect()
      } catch {
        /* ignore */
      }
      process.exit(1)
    }
  } else {
    console.log('Tip: pass --obs-source "Your Browser Source Name" to auto-set the URL.')
  }

  // Give the browser source time to load the page and receive SSE state.
  await sleep(obsOpts.source ? 2000 : 1500)

  const recDur = totalDuration + 0.5
  let cap
  try {
    cap = startAudioCapture({ device: audioDevice, channels: audioChannels, rate: audioRate, outFile: audioFile })
  } catch (e) {
    console.error(e.message)
    cleanup()
    try {
      await obs.disconnect()
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  try {
    await startObsRecording(obs)
    await waitForObsRecording(obs)
  } catch (e) {
    console.error(e.message)
    cap.stop()
    cleanup()
    try {
      await obs.disconnect()
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  await sleep(300)
  engine.play()
  await sleep(recDur * 1000)
  engine.stop()
  const frames = cap.stop()
  console.log(`Capture complete (${(frames / audioRate).toFixed(1)}s audio). Stopping OBS...`)

  let videoFile
  try {
    videoFile = await stopObsRecording(obs)
    await waitForFile(videoFile)
  } catch (e) {
    console.error(e.message)
    cleanup()
    try {
      await obs.disconnect()
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  try {
    await obs.disconnect()
  } catch {
    /* ignore */
  }

  try {
    statSync(audioFile)
  } catch {
    console.error('Audio recording failed: no audio file written.')
    cleanup()
    process.exit(1)
  }

  console.log(`OBS video: ${videoFile}`)
  const avOffsetMs = resolveAvOffset(argv)
  if (avOffsetMs) {
    const hint = avOffsetMs > 0 ? 'audio delayed relative to video' : 'video delayed relative to audio'
    console.log(`A/V offset: ${avOffsetMs > 0 ? '+' : ''}${avOffsetMs}ms (${hint})`)
  }
  console.log('Encoding final video...')
  try {
    await muxVideoAudio({ videoFile, audioFile, outPath, fps: argv.fps, avOffsetMs })
  } catch (e) {
    console.error(e.message)
    cleanup()
    process.exit(1)
  }

  cleanup()
  if (!argv.keepTemps) {
    try {
      rmSync(tmpDir, { recursive: true })
    } catch {
      /* ignore */
    }
  } else {
    console.log(`Temp files: ${tmpDir}`)
  }

  console.log(`Done: ${outPath}`)
  return outPath
}

// One full render pipeline: engine + server + headless browser + ffmpeg audio + mux.
async function renderSession({ playlist, singleMode, totalDuration, outPath, label, argv, opts }) {
  if (argv.obs) {
    return renderSessionObs({ playlist, singleMode, totalDuration, outPath, label, argv, opts })
  }

  const { dims, audioDevice, audioChannels, audioRate, devName, chromium, browserPath } = opts

  const { engine, server, httpPort } = await setupRenderEngine({ playlist, singleMode, argv, devName })
  const cleanup = createRenderCleanup(engine, server)
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'opl-render-'))
  const audioFile = join(tmpDir, 'audio.wav')

  console.log(`\nRendering: ${label}  (${totalDuration.toFixed(1)}s)`)
  console.log(
    `Resolution: ${dims.w}x${dims.h}  Audio: ${audioDevice}${audioChannels ? ` ch${audioChannels}` : ''} @ ${audioRate}Hz  MIDI: ${devName}`,
  )

  let browser
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserPath || undefined })
  } catch (e) {
    console.error(
      `Failed to launch ${browserPath ? `browser at ${browserPath}` : "Playwright's bundled browser"}: ${e.message}`,
    )
    if (!browserPath) {
      console.error(
        "If this is an older OS (e.g. macOS < 14), Playwright's downloaded browser may not run here.\n" +
          'Point at an installed Chrome/Chromium instead with --browser-path (or OPL_BROWSER_PATH), e.g.:\n' +
          '  --browser-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"\n' +
          'Or capture via a live OBS session instead: --obs',
      )
    }
    process.exit(1)
  }
  const context = await browser.newContext({
    viewport: { width: dims.w, height: dims.h },
    recordVideo: { dir: tmpDir, size: { width: dims.w, height: dims.h } },
  })
  const page = await context.newPage()

  await page.goto(`http://localhost:${httpPort}/render.html`, { waitUntil: 'domcontentloaded' })
  await page
    .waitForFunction(
      () => {
        const el = document.getElementById('track-name')
        return el && el.textContent && el.textContent.trim().length > 0 && el.textContent.trim() !== '\u2014'
      },
      { timeout: 5000 },
    )
    .catch(() => {})

  // Start audio recording via audify (RtAudio -> CoreAudio).
  const recDur = totalDuration + 0.5
  let cap
  try {
    cap = startAudioCapture({ device: audioDevice, channels: audioChannels, rate: audioRate, outFile: audioFile })
  } catch (e) {
    console.error(e.message)
    cleanup()
    process.exit(1)
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
  if (webmFiles.length === 0) {
    console.error('No video file created.')
    cleanup()
    process.exit(1)
  }
  const videoFile = join(tmpDir, webmFiles[0])

  try {
    statSync(audioFile)
  } catch {
    console.error('Audio recording failed: no audio file written.')
    cleanup()
    process.exit(1)
  }

  console.log('Encoding final video...')
  const avOffsetMs = resolveAvOffset(argv)
  if (avOffsetMs) {
    const hint = avOffsetMs > 0 ? 'audio delayed relative to video' : 'video delayed relative to audio'
    console.log(`A/V offset: ${avOffsetMs > 0 ? '+' : ''}${avOffsetMs}ms (${hint})`)
  }
  try {
    await muxVideoAudio({ videoFile, audioFile, outPath, fps: argv.fps, avOffsetMs })
  } catch (e) {
    console.error(e.message)
    cleanup()
    process.exit(1)
  }

  cleanup()
  if (!argv.keepTemps) {
    try {
      rmSync(tmpDir, { recursive: true })
    } catch {
      /* ignore */
    }
  } else {
    console.log(`Temp files: ${tmpDir}`)
  }

  console.log(`Done: ${outPath}`)
  return outPath
}

async function cmdRender(argv) {
  if (argv.listAudio) {
    await listAudioDevices()
    return
  }

  // Resolve paths (file(s) or folder(s))
  const paths = argv.paths || []
  if (paths.length === 0) {
    console.error('No files specified. Usage: opl render <file.mid | folder> [options]')
    process.exit(1)
  }
  const files = collectFiles(paths.map(resolveLib), argv.recursive)
  if (files.length === 0) {
    console.error('No MIDI files found.')
    process.exit(1)
  }

  const opts = await resolveRenderOpts(argv)
  const tag =
    argv.resolution || (argv.platform && argv.aspect) ? `${opts.dims.w}x${opts.dims.h}` : argv.ratio.replace(':', 'x')

  // --- Album mode: all tracks as one continuous video ---
  if (argv.album && files.length > 1) {
    let totalDuration = argv.tail
    for (const f of files) {
      const midi = new Midi(readMidiData(f))
      totalDuration += midi.duration
    }
    console.log(`Album: ${files.length} tracks, ${totalDuration.toFixed(1)}s total`)
    const outPath = argv.output || join(process.cwd(), `album.${tag}.mp4`)
    await renderSession({
      playlist: files,
      singleMode: false,
      totalDuration,
      outPath,
      label: `${files.length} tracks (album)`,
      argv,
      opts,
    })
    process.exit(0)
  }

  // --- Single file ---
  if (files.length === 1) {
    const midi = new Midi(readMidiData(files[0]))
    const totalDuration = midi.duration + argv.tail
    const outPath = argv.output || join(process.cwd(), `${basename(files[0], extname(files[0]))}.${tag}.mp4`)
    await renderSession({
      playlist: [files[0]],
      singleMode: true,
      totalDuration,
      outPath,
      label: basename(files[0]),
      argv,
      opts,
    })
    process.exit(0)
  }

  // --- Batch mode: one video per file ---
  console.log(`Batch: ${files.length} files`)
  for (let i = 0; i < files.length; i++) {
    console.log(`\n[${i + 1}/${files.length}]`)
    try {
      const midi = new Midi(readMidiData(files[i]))
      const totalDuration = midi.duration + argv.tail
      const outPath = join(process.cwd(), `${basename(files[i], extname(files[i]))}.${tag}.mp4`)
      await renderSession({
        playlist: [files[i]],
        singleMode: true,
        totalDuration,
        outPath,
        label: basename(files[i]),
        argv,
        opts,
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
  .command(
    'note <note>',
    'play a single note',
    (y) =>
      y
        .positional('note', { type: 'number', describe: 'MIDI note (60 = middle C)' })
        .option('vel', { type: 'number', default: 100 })
        .option('dur', { type: 'number', default: 0.5, describe: 'seconds' })
        .option('ch', { type: 'number', default: 1, describe: 'MIDI channel 1-16' }),
    cmdNote,
  )
  .command(
    'chord <notes..>',
    'play notes together',
    (y) =>
      y
        .positional('notes', { type: 'number' })
        .option('vel', { type: 'number', default: 100 })
        .option('dur', { type: 'number', default: 1 })
        .option('ch', { type: 'number', default: 1 }),
    cmdChord,
  )
  .command(
    'scale',
    'play a major scale',
    (y) =>
      y
        .option('root', { type: 'number', default: 60 })
        .option('vel', { type: 'number', default: 100 })
        .option('dur', { type: 'number', default: 0.25 })
        .option('ch', { type: 'number', default: 1 }),
    cmdScale,
  )
  .command(
    'pc <program>',
    'program change (GM patch 0-127)',
    (y) => y.positional('program', { type: 'number' }).option('ch', { type: 'number', default: 1 }),
    cmdPc,
  )
  .command(
    'cc <number> <value>',
    'send a control change',
    (y) =>
      y
        .positional('number', { type: 'number', describe: 'CC number 0-127' })
        .positional('value', { type: 'number', describe: 'value 0-127' })
        .option('ch', { type: 'number', default: 1 }),
    cmdCc,
  )
  .command('panic', 'silence all stuck notes', () => {}, cmdPanic)
  .command(
    'play <paths..>',
    'play .mid file(s) or folder(s)',
    (y) =>
      y
        .positional('paths', { type: 'string' })
        .option('recursive', { alias: 'r', type: 'boolean', default: false })
        .option('shuffle', { type: 'boolean', default: false })
        .option('loop', { type: 'boolean', default: false })
        .option('ch', { type: 'number', describe: 'force all events onto this channel 1-16' }),
    cmdPlay,
  )
  .command(
    'serve [folder]',
    'web player + visualizer; pick any MIDI output device',
    (y) =>
      y
        .positional('folder', { type: 'string', describe: 'folder of .mid files (default: current dir)' })
        .option('recursive', { alias: 'r', type: 'boolean', default: false })
        .option('http', { type: 'number', default: 7373, describe: 'HTTP port for the web UI' })
        .option('theme', { type: 'string', describe: 'web theme: green (default) or winamp' })
        .option('title', { type: 'string', describe: 'app title shown in the UI (default "OPL · MIDI PLAYER")' })
        .option('layout', {
          type: 'string',
          choices: ['normal', 'minimized', 'overlay'],
          describe: 'display layout: normal, minimized (hide playlist, large title), or overlay (OBS transparent)',
        })
        .option('repeat', {
          alias: 'loop',
          type: 'boolean',
          default: false,
          describe: 'loop playlist when a track ends',
        })
        .option('shuffle', { type: 'boolean', default: false, describe: 'shuffle play order' })
        .option('ui', {
          type: 'string',
          choices: ['classic', 'v2'],
          describe: 'web UI: v2 React SPA (default) or classic legacy page (or OPL_UI)',
        })
        .option('preset', {
          type: 'string',
          choices: ['full', 'player-only'],
          describe: 'config preset; player-only = embeddable widget (SoundFont, no menu/upload/edit)',
        })
        .option('config', {
          type: 'string',
          describe: 'path to a JSON config file (feature flags + defaults; or a preset name; or OPL_CONFIG)',
        }),
    cmdServe,
  )
  .command(
    'render [paths..]',
    'render MIDI file(s) or folder to video (headless)',
    (y) =>
      y
        .positional('paths', { type: 'string', describe: '.mid file(s) or folder(s)' })
        .option('recursive', { alias: 'r', type: 'boolean', default: false, describe: 'recurse into subfolders' })
        .option('album', { type: 'boolean', default: false, describe: 'render all tracks as one continuous video' })
        .option('audio-device', { type: 'string', describe: 'audio input device name (use --list-audio to see)' })
        .option('audio-channels', {
          type: 'string',
          describe: 'capture only these two 1-based input channels as stereo, e.g. "7,8"',
        })
        .option('audio-rate', {
          type: 'number',
          describe: 'audio sample rate (default 48000; match your interface, e.g. 44100)',
        })
        .option('output', { alias: 'o', type: 'string', describe: 'output video file (.mp4)' })
        .option('ratio', {
          type: 'string',
          default: '16:9',
          choices: ['16:9', '9:16', '1:1', '4:5'],
          describe: 'aspect ratio preset (ignored when --platform/--aspect or --resolution is set)',
        })
        .option('platform', {
          type: 'string',
          choices: ['youtube', 'instagram'],
          describe: 'social video platform preset (use with --aspect)',
        })
        .option('aspect', {
          type: 'string',
          choices: ['landscape', 'portrait', 'square', 'story'],
          describe: 'platform aspect: youtube landscape/portrait; instagram square/portrait/story',
        })
        .option('resolution', {
          type: 'string',
          describe: 'custom resolution WxH (overrides --platform/--aspect and --ratio)',
        })
        .option('art', { type: 'string', describe: 'path to album art image' })
        .option('tail', { type: 'number', default: 3, describe: 'seconds of tail after last note (default: 3)' })
        .option('device', { type: 'string', describe: 'MIDI output device name substring' })
        .option('port', { type: 'number', describe: 'HTTP port for internal server (default: random)' })
        .option('fps', { type: 'number', default: 30, describe: 'output video framerate' })
        .option('keep-temps', { type: 'boolean', default: false, describe: 'keep temp files (video.webm, audio.wav)' })
        .option('list-audio', { type: 'boolean', default: false, describe: 'list audio input devices and exit' })
        .option('theme', { type: 'string', describe: 'visualizer theme: green (default) or winamp' })
        .option('title', {
          type: 'string',
          describe: 'app title shown in the visualizer (default "OPL · MIDI PLAYER")',
        })
        .option('layout', {
          type: 'string',
          choices: ['normal', 'minimized', 'overlay'],
          describe: 'display layout: normal, minimized (hide playlist, large title), or overlay (OBS transparent)',
        })
        .option('obs', {
          type: 'boolean',
          default: false,
          describe: 'capture video from a running OBS session (WebSocket) instead of headless Playwright',
        })
        .option('obs-url', {
          type: 'string',
          describe: 'OBS WebSocket URL (default ws://127.0.0.1:4455, or OPL_OBS_URL in .env)',
        })
        .option('obs-password', {
          type: 'string',
          describe: 'OBS WebSocket password (or OPL_OBS_PASSWORD in .env)',
        })
        .option('obs-source', {
          type: 'string',
          describe: 'OBS browser source name to point at the visualizer (or OPL_OBS_SOURCE in .env)',
        })
        .option('av-offset', {
          type: 'number',
          describe: 'A/V sync tweak in ms at mux (+ delays audio, − delays video; or OPL_AV_OFFSET)',
        })
        .option('browser-path', {
          type: 'string',
          describe:
            "path to an installed Chromium/Chrome executable to drive instead of downloading one (or OPL_BROWSER_PATH). Use when Playwright's bundled browser won't launch on this OS (e.g. macOS < 14).",
        }),
    cmdRender,
  )
  .demandCommand(1, 'Pick a command (try --help).')
  .strict()
  .help()
  .alias('h', 'help')
  .parse()
