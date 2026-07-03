import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseM3U, parseJSPF } from '../../core/playlist.ts'
import { resolveLib } from './paths.ts'

/** Resolve one playlist entry to an existing absolute path, or null if not found. */
function resolveEntry(entry: string, baseDir: string): string | null {
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
export function loadPlaylist(playlistPath: string): string[] {
  const ext = extname(playlistPath).toLowerCase()
  const body = readFileSync(playlistPath, 'utf8')

  let entries: string[]
  try {
    entries = ext === '.m3u' || ext === '.m3u8' ? parseM3U(body) : parseJSPF(body)
  } catch (e) {
    console.error(`skip (not a readable playlist): ${playlistPath} — ${(e as Error).message}`)
    return []
  }

  const baseDir = dirname(playlistPath)
  const out: string[] = []
  for (const entry of entries) {
    const resolved = resolveEntry(entry, baseDir)
    if (resolved) out.push(resolved)
    else console.error('skip (playlist entry not found):', entry)
  }
  return out
}
