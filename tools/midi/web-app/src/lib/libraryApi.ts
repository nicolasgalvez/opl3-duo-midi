import type { LibraryEntry } from './types'

// Client for the backend media library (tools/midi/opl.mjs → /api/library*).
// All calls swallow transport errors so the UI degrades gracefully offline.

export async function fetchLibrary(q = ''): Promise<LibraryEntry[]> {
  try {
    const res = await fetch(`/api/library${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.entries ?? []) as LibraryEntry[]
  } catch {
    return []
  }
}

export async function uploadFile(file: File): Promise<void> {
  try {
    await fetch('/api/library/upload', {
      method: 'POST',
      headers: { 'x-filename': file.name },
      body: await file.arrayBuffer(),
    })
  } catch {
    /* ignore */
  }
}

async function libraryOp(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    /* ignore */
  }
}

export const removeEntry = (id: number) => libraryOp({ op: 'remove', id })
export const playEntries = (ids: number[]) => libraryOp({ op: 'play', ids })
export const addPaths = (paths: string[], recursive = true) => libraryOp({ op: 'add', paths, recursive })
