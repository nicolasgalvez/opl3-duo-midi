/** One media-library row: a path + metadata, never a copy of the file itself. */
export interface LibraryEntry {
  id: number
  path: string
  name: string
  folder: string
  /** Epoch milliseconds (Date.now() at upload time), or null when unknown. */
  addedAt: number | null
  tags: string[]
}
