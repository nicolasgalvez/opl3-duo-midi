import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import toneMidiPkg from '@tonejs/midi'
import type { Midi as ToneMidi } from '@tonejs/midi'

import { PLAYABLE_EXTS, detectFormat } from '../../core/format.ts'
import { extractMidiBuffer } from '../../core/midiFile.ts'
import { parseVgm, toFlatEvents, type ParsedVgm } from '../../core/vgm.ts'
import { buildMidiEventList, type EventList } from '../../core/events.ts'
import { isPlaylistFile } from '../../core/playlist.ts'
import { loadPlaylist } from './playlist.ts'
import { resolveLib } from './paths.ts'

const { Midi } = toneMidiPkg

/** Expand files/folders/playlists into a deduped, ordered list of playable files. */
export function collectFiles(paths: string[], recursive?: boolean): string[] {
  const isMidi = (p: string) => PLAYABLE_EXTS.includes(extname(p).toLowerCase())
  const out: string[] = []
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
      const walk = (dir: string) => {
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

export type LoadedTrack = { format: 'vgm'; vgm: ParsedVgm } | { format: 'midi'; midi: ToneMidi }

// Read a track file once and parse it by detected content — never by
// extension, so a VGM renamed to .mid still routes correctly. Shared by the
// terminal play path, the Engine/serve path, and render's duration lookup.
export function loadTrack(path: string): LoadedTrack {
  const buf = readFileSync(path)
  if (detectFormat(buf) === 'vgm') return { format: 'vgm', vgm: parseVgm(buf) }
  return { format: 'midi', midi: new Midi(extractMidiBuffer(buf, path)) }
}

export function trackDuration(path: string): number {
  const track = loadTrack(path)
  return track.format === 'vgm' ? track.vgm.duration : track.midi.duration
}

/** Load a track and flatten it into plain data events for the Engine + visualizer. */
export function buildEventList(path: string, forceCh?: number | null): EventList {
  const track = loadTrack(path)
  return track.format === 'vgm'
    ? { events: toFlatEvents(track.vgm), duration: track.vgm.duration }
    : buildMidiEventList(track.midi, forceCh)
}
