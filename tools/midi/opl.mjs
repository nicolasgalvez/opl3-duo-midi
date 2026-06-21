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
import { basename, extname, join } from 'node:path'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'
import easymidi from 'easymidi'
import toneMidiPkg from '@tonejs/midi'
import yargs from 'yargs'

const { Midi } = toneMidiPkg
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
  for (const p of paths) {
    let st
    try { st = statSync(p) } catch { console.error('skip (not found):', p); continue }
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
  .demandCommand(1, 'Pick a command (try --help).')
  .strict()
  .help()
  .alias('h', 'help')
  .parse()
