import type { Midi } from '@tonejs/midi'
import type { MidiOutput } from '../ports/midiOutput.ts'
import type { RawFlatEvent, ParsedVgm } from './vgm.ts'
import { rawWriteSysEx, bankForPort } from './oplRaw.ts'

// Two event shapes for two consumers:
//  - TimedAction: closure-based, for the terminal play path's scheduler.
//  - FlatEvent: plain data (no closures), for the Engine + browser visualizer,
//    which needs to serialize events over SSE.

export interface TimedAction {
  t: number
  fn: () => void
}

export type FlatEvent = { t: number; k: 'on' | 'off' | 'cc' | 'pitch' | 'program'; c: number; a: number; b: number } | RawFlatEvent

export interface EventList {
  events: FlatEvent[]
  duration: number
}

export interface TimedActionList {
  events: TimedAction[]
  duration: number
}

// Flatten a parsed MIDI file into a time-sorted list of send actions.
export function buildMidiEvents(out: MidiOutput, midi: Midi, forceCh?: number | null): TimedActionList {
  const events: TimedAction[] = []
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
      for (const c of track.controlChanges[num]!) {
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

// Flatten a parsed VGM into the same {events,duration} shape as buildMidiEvents
// — the play scheduler only ever touches events[].t/.fn(), so it needs no
// VGM-specific handling at all.
export function buildVgmEvents(out: MidiOutput, vgm: ParsedVgm): TimedActionList {
  const events = vgm.writes.map(({ t, port, reg, value }) => ({
    t,
    fn: () => out.send('sysex', rawWriteSysEx(bankForPort(port), reg, value)),
  }))
  return { events, duration: vgm.duration }
}

// Flatten a .mid into plain data events (no closures) for the engine + viz.
export function buildMidiEventList(midi: Midi, forceCh?: number | null): EventList {
  const events: FlatEvent[] = []
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
      for (const cc of track.controlChanges[num]!) {
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

/** Replay one flat event onto a real MIDI output. */
export function sendRaw(out: MidiOutput, ev: FlatEvent): void {
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
    case 'raw':
      out.send('sysex', ev.bytes)
      break
  }
}
