import { JSONFilePreset } from 'lowdb/node'
import type { Low } from 'lowdb'
import { basename, dirname, resolve } from 'node:path'

import type { LibraryEntry } from '../../contracts/library.ts'

// A small, persistent media library indexed by canonical absolute path. It
// stores paths + metadata only (never copies of the MIDI files), deduped by
// path, backed by a lowdb JSON file so it survives server restarts.

interface LibraryData {
  entries: LibraryEntry[]
  seq: number
}

export interface LibraryEntryMeta {
  addedAt?: number | null
  tags?: string[]
}

export async function openLibrary(dbPath: string): Promise<Library> {
  const db = await JSONFilePreset<LibraryData>(dbPath, { entries: [], seq: 0 })
  return new Library(db)
}

export class Library {
  readonly db: Low<LibraryData>

  constructor(db: Low<LibraryData>) {
    this.db = db
  }

  static canonical(p: string): string {
    return resolve(p)
  }

  /** Add a file by path. Returns the existing row if its canonical path is already present. */
  async add(path: string, meta: LibraryEntryMeta = {}): Promise<LibraryEntry> {
    const p = Library.canonical(path)
    const existing = this.db.data.entries.find((e) => e.path === p)
    if (existing) return existing
    const entry: LibraryEntry = {
      id: ++this.db.data.seq,
      path: p,
      name: basename(p),
      folder: basename(dirname(p)),
      addedAt: meta.addedAt ?? null,
      tags: meta.tags ?? [],
    }
    this.db.data.entries.push(entry)
    await this.db.write()
    return entry
  }

  async addMany(paths: string[], meta?: LibraryEntryMeta): Promise<LibraryEntry[]> {
    const out: LibraryEntry[] = []
    for (const p of paths) out.push(await this.add(p, meta))
    return out
  }

  /** All entries, or those whose name/folder contains `q` (case-insensitive). */
  list(q?: string | null): LibraryEntry[] {
    const entries = this.db.data.entries
    if (!q) return entries.slice()
    const needle = String(q).toLowerCase()
    return entries.filter((e) => e.name.toLowerCase().includes(needle) || e.folder.toLowerCase().includes(needle))
  }

  async remove(id: number): Promise<boolean> {
    const before = this.db.data.entries.length
    this.db.data.entries = this.db.data.entries.filter((e) => e.id !== id)
    const removed = this.db.data.entries.length < before
    if (removed) await this.db.write()
    return removed
  }
}
