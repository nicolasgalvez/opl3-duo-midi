import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveLib } from './paths.mjs'

// Established playlist formats: M3U/M3U8 (de-facto plaintext) and JSPF (the JSON
// sibling of XSPF, the open Xiph standard — https://www.xspf.org/jspf). `.json`
// is accepted as JSPF too; a non-JSPF .json simply yields no tracks.
const PLAYLIST_EXTS = ['.m3u', '.m3u8', '.jspf', '.json']

/** True when `p` names a playlist file we know how to expand. */
export function isPlaylistFile(p) {
  return PLAYLIST_EXTS.includes(extname(p).toLowerCase())
}

/** Parse an M3U/M3U8 body into ordered track entries (paths/URIs), preserving order. */
export function parseM3U(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')) // drop blanks, #EXTM3U, #EXTINF, # comments
}

/** Parse a JSPF body into ordered track entries from `playlist.track[].location`. */
export function parseJSPF(content) {
  const data = JSON.parse(content)
  const tracks = data?.playlist?.track
  if (!Array.isArray(tracks)) {
    throw new Error('not a JSPF playlist (expected playlist.track[])')
  }
  return tracks
    .map((t) => (Array.isArray(t?.location) ? t.location[0] : t?.location))
    .filter((loc) => typeof loc === 'string' && loc.length > 0)
}

/** Resolve one playlist entry to an existing absolute path, or null if not found. */
function resolveEntry(entry, baseDir) {
  let p = entry
  if (p.startsWith('file://')) {
    try {
      p = fileURLToPath(p)
    } catch {
      /* leave non-file URL as-is; it won't resolve and gets skipped */
    }
  }
  if (isAbsolute(p)) return existsSync(p) ? p : null
  const local = join(baseDir, p) // relative to the playlist file's own directory first
  if (existsSync(local)) return local
  const lib = resolveLib(p) // then cwd / MIDI_LIBRARY (shared with folder/file args)
  if (existsSync(lib)) return lib
  return null
}

/**
 * Load a playlist file into an ordered list of absolute track paths.
 * Track order is preserved; entries that can't be resolved are skipped with a
 * warning rather than aborting the whole playlist.
 */
export function loadPlaylist(playlistPath) {
  const ext = extname(playlistPath).toLowerCase()
  const body = readFileSync(playlistPath, 'utf8')

  let entries
  try {
    entries = ext === '.m3u' || ext === '.m3u8' ? parseM3U(body) : parseJSPF(body)
  } catch (e) {
    console.error(`skip (not a readable playlist): ${playlistPath} — ${e.message}`)
    return []
  }

  const baseDir = dirname(playlistPath)
  const out = []
  for (const entry of entries) {
    const resolved = resolveEntry(entry, baseDir)
    if (resolved) out.push(resolved)
    else console.error('skip (playlist entry not found):', entry)
  }
  return out
}
