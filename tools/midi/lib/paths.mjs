import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { statSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Absolute path to tools/midi (where opl.mjs and web/ live). */
export const MIDI_TOOL_DIR = join(__dirname, '..')

/** Repo root (parent of tools/midi). */
export const REPO_ROOT = join(MIDI_TOOL_DIR, '..', '..')

/** Load .env from repo root and tools/midi (later files do not override earlier keys). */
export function loadEnv() {
  for (const dir of [REPO_ROOT, MIDI_TOOL_DIR]) {
    try {
      process.loadEnvFile(join(dir, '.env'))
    } catch {
      /* no .env in this dir */
    }
  }
}

/** Resolve a path; for a relative path not found in cwd, fall back to MIDI_LIBRARY. */
export function resolveLib(p) {
  if (isAbsolute(p)) return p
  try {
    statSync(p)
    return p
  } catch {
    /* not relative to cwd */
  }
  const base = process.env.MIDI_LIBRARY
  if (base) {
    const alt = join(base, p)
    try {
      statSync(alt)
      return alt
    } catch {
      /* not in library */
    }
  }
  return p
}
