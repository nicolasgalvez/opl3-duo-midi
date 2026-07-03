import { basename, dirname } from 'node:path'

import type { ClosableMidiOutput } from '../ports/midiOutput.ts'
import type { Config } from '../contracts/config.ts'
import type { FlatEvent, EventList } from './events.ts'
import { sendRaw } from './events.ts'
import { buildAllNotesOffMessages, buildControllerResetMessages, sendMessages } from './midiReset.ts'
import { nextPlaylistIndex, prevPlaylistIndex, shuffleOrder } from './playback.ts'
import { removeTrack as removeTrackPure, moveTrack as moveTrackPure } from './playlistEdit.ts'
import { toM3U, toJSPF } from './playlistWrite.ts'

// Full MIDI System Reset (0xFF real-time byte), sent before every track starts.
// Cheap and idempotent: it's what makes track transitions self-healing if a
// prior VGM session (or a crashed process) left the chip's raw registers dirty
// — OplSynth::systemReset() re-asserts setOPL3Enabled/setAll4OPChannelsEnabled,
// which raw register writes can otherwise leave in a broken state.
export function resetToBaseline(out: ClosableMidiOutput): void {
  try {
    out.send('reset')
  } catch {
    /* ignore — best-effort */
  }
}

export interface PlaylistItem {
  path: string
  name: string
  folder: string
}

/** One connected SSE consumer (an http.ServerResponse in practice). */
export interface SseClient {
  write(chunk: string): unknown
}

/** A library the engine can expose over /api/library (adapters/storage/library.ts). */
export interface EngineLibrary {
  add(path: string, meta?: { addedAt?: number | null; tags?: string[] }): Promise<unknown>
  addMany(paths: string[], meta?: { addedAt?: number | null; tags?: string[] }): Promise<unknown[]>
  list(q?: string | null): { id: number; path: string }[]
  remove(id: number): Promise<boolean>
}

/**
 * Everything the engine needs from the outside world, injected so the core
 * never imports an adapter (see ARCHITECTURE.md). The CLI wires the real
 * easymidi/UDP/fs implementations in src/cli/wiring.ts.
 */
export interface EngineDeps {
  listOutputs(): string[]
  openUsbOutput(name: string): ClosableMidiOutput
  openNetOutput(host: string, port: number): ClosableMidiOutput
  collectFiles(paths: string[], recursive?: boolean): string[]
  buildEventList(path: string, forceCh?: number | null): EventList
  writeFile(path: string, body: string): void
}

export class Engine {
  readonly deps: EngineDeps
  out: ClosableMidiOutput | null = null
  deviceName: string | null = null
  playlist: PlaylistItem[] = []
  index = -1
  events: FlatEvent[] = []
  duration = 0
  evIndex = 0
  playing = false
  elapsed = 0
  lastTick = 0
  lastPos = 0
  clients = new Set<SseClient>()
  single = false
  repeat = false
  shuffle = false
  #shuffleOrder: number[] = []
  artPath: string | null = null
  library: EngineLibrary | null = null
  uploadsDir: string | null = null
  config: Config | null = null
  theme = 'green'
  layout = 'normal'
  title = 'OPL · MIDI PLAYER'
  timer: NodeJS.Timeout

  constructor(deps: EngineDeps) {
    this.deps = deps
    this.timer = setInterval(() => this.tick(), 5)
  }

  setPlaylist(files: string[]): void {
    this.playlist = files.map((f) => ({ path: f, name: basename(f), folder: basename(dirname(f)) }))
    this.#shuffleOrder = this.shuffle ? shuffleOrder(this.playlist.length) : []
  }

  // ── File menu: open folders / files / playlists (reuses collectFiles, which
  //    handles .m3u/.jspf playlists from ODM-1 and MIDI_LIBRARY resolution). ──
  openPaths(paths: string | string[], recursive = false): void {
    const list = Array.isArray(paths) ? paths : [paths]
    const files = this.deps.collectFiles(list.filter(Boolean), recursive)
    this.setPlaylist(files)
    if (files.length) this.load(0)
    else {
      this.index = -1
      this.broadcastState()
    }
  }

  // ── Edit menu: remove / reorder, keeping the playing track under the cursor. ──
  removeTrack(removeIdx: number): void {
    const wasCurrent = removeIdx === this.index
    const { items, current } = removeTrackPure(this.playlist, this.index, removeIdx)
    this.playlist = items
    this.#shuffleOrder = this.shuffle ? shuffleOrder(items.length) : []
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

  moveTrack(from: number, to: number): void {
    const { items, current } = moveTrackPure(this.playlist, this.index, from, to)
    this.playlist = items
    this.index = current
    this.#shuffleOrder = this.shuffle ? shuffleOrder(items.length) : []
    this.broadcastState() // same track keeps playing; only queue order changed
  }

  // ── File menu: save the current queue as .m3u or .jspf. ──
  savePlaylist(path: string, format?: string): { ok: boolean; path?: string; count?: number; error?: string } {
    try {
      const paths = this.playlist.map((p) => p.path)
      const fmt = format || (String(path).toLowerCase().endsWith('.jspf') ? 'jspf' : 'm3u')
      const body = fmt === 'jspf' ? toJSPF(paths, { title: this.title }) : toM3U(paths)
      this.deps.writeFile(path, body)
      return { ok: true, path, count: paths.length }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  setRepeat(on: boolean): void {
    this.repeat = !!on
    this.broadcastState()
  }

  setShuffle(on: boolean): void {
    this.shuffle = !!on
    this.#shuffleOrder = this.shuffle ? shuffleOrder(this.playlist.length) : []
    this.broadcastState()
  }

  #closeOutput(): void {
    if (!this.out) return
    try {
      this.allNotesOff()
      this.out.close()
    } catch {
      /* ignore */
    }
    this.out = null
  }

  selectDevice(name: string): void {
    this.#closeOutput()
    const outs = this.deps.listOutputs()
    const found = outs.find((n) => n === name) || outs.find((n) => n.toLowerCase().includes((name || '').toLowerCase()))
    if (found) {
      this.out = this.deps.openUsbOutput(found)
      this.deviceName = found
    }
    this.broadcastState()
  }

  // Network alternative to selectDevice() — targets a wifi-MIDI receiver (e.g.
  // an mt32-pi) over UDP instead of a USB port.
  selectNetworkDevice(host: string, port: number): void {
    this.#closeOutput()
    this.out = this.deps.openNetOutput(host, port)
    this.deviceName = this.out.name
    this.broadcastState()
  }

  load(i: number): void {
    if (i < 0 || i >= this.playlist.length) return
    if (this.out) resetToBaseline(this.out) // self-heals if a prior VGM session left the chip dirty
    this.resetAll()
    this.index = i
    const item = this.playlist[i]!
    try {
      const r = this.deps.buildEventList(item.path)
      this.events = r.events
      this.duration = r.duration
    } catch (e) {
      console.error(`   ! failed to load ${item.path}: ${(e as Error).message}`)
      this.events = []
      this.duration = 0
    }
    this.evIndex = 0
    this.elapsed = 0
    this.broadcast({ type: 'reset' })
    this.broadcastState()
  }

  play(): void {
    if (this.out && this.events.length) {
      this.playing = true
      this.lastTick = performance.now()
      this.broadcastState()
    }
  }
  pause(): void {
    this.playing = false
    this.resetAll()
    this.broadcast({ type: 'reset' })
    this.broadcastState()
  }
  stop(): void {
    this.playing = false
    this.evIndex = 0
    this.elapsed = 0
    this.resetAll()
    this.broadcast({ type: 'reset' })
    this.broadcastState()
  }
  next(): void {
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
      order: this.#shuffleOrder,
    })
    if (idx == null) {
      this.stop()
      return
    }
    this.load(idx)
    this.play()
  }
  prev(): void {
    if (this.playlist.length === 0) return
    const idx = prevPlaylistIndex({
      index: this.index,
      length: this.playlist.length,
      shuffle: this.shuffle,
      order: this.#shuffleOrder,
    })
    this.load(idx)
    this.play()
  }

  allNotesOff(): void {
    if (!this.out) return
    sendMessages(this.out, buildAllNotesOffMessages())
  }

  // Full GM-style reset so controller state (mod wheel, pitch bend, sustain, expression,
  // volume, pan, program) can't bleed from one track into the next in album/playlist mode.
  resetAll(): void {
    if (!this.out) return
    sendMessages(this.out, buildControllerResetMessages())
  }

  tick(): void {
    if (!this.playing) return
    const now = performance.now()
    this.elapsed += (now - this.lastTick) / 1000
    this.lastTick = now
    while (this.evIndex < this.events.length && this.events[this.evIndex]!.t <= this.elapsed) {
      const ev = this.events[this.evIndex++]!
      if (this.out) sendRaw(this.out, ev)
      if (ev.k === 'on' || ev.k === 'off' || ev.k === 'cc')
        this.broadcast({ type: 'ev', k: ev.k, c: ev.c, a: ev.a, b: ev.b })
      else if (ev.k === 'raw') this.broadcast({ type: 'ev', k: ev.k, port: ev.port, reg: ev.reg, value: ev.value })
    }
    if (now - this.lastPos > 100) {
      this.lastPos = now
      this.broadcast({ type: 'pos', t: this.elapsed, d: this.duration })
    }
    if (this.evIndex >= this.events.length) this.next()
  }

  state() {
    return {
      type: 'state' as const,
      devices: this.deps.listOutputs(),
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

  broadcastState(): void {
    this.broadcast(this.state())
  }
  broadcast(obj: unknown): void {
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
