/** One media-library row: a path + metadata, never a copy of the file itself. */
export interface LibraryEntry {
  id: number
  path: string
  name: string
  folder: string
  addedAt: string | null
  tags: string[]
}
