import { extname } from 'node:path'

// SoundFonts live under <volume>/soundfonts on the mt32-pi's SD/USB volumes.
export const SOUNDFONT_DIR = 'soundfonts'

// The device validates candidate files by their RIFF/sfbk header content, not
// extension (src/soundfontmanager.cpp: CheckSoundFont), so it silently skips
// anything that isn't a real SoundFont (e.g. the "place-soundfonts-here.txt"
// placeholder it ships with). We can't cheaply replicate a content check over
// FTP, so filter by the extensions the device's own docs tell users to use —
// this matches real-world directories and keeps the computed index in sync.
const SOUNDFONT_EXTENSIONS = new Set(['.sf2', '.sf3'])

function strcasecmp(a: string, b: string): number {
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  return al < bl ? -1 : al > bl ? 1 : 0
}

export function isSoundFontFile(name: string): boolean {
  return SOUNDFONT_EXTENSIONS.has(extname(name).toLowerCase())
}

// Reproduces mt32-pi's own sort (src/soundfontmanager.cpp:
// SoundFontListComparator -> strcasecmp on path) so the computed index here
// matches the index the device assigns internally after ScanSoundFonts().
export function sortSoundFontNames(names: string[]): string[] {
  return [...names].sort(strcasecmp)
}

// Resolves a CLI-friendly name/substring/index into the device's SoundFont
// index. `names` must already be sorted with sortSoundFontNames().
export function findSoundFontIndex(names: string[], nameOrIndex: string | number): number {
  if (/^\d+$/.test(String(nameOrIndex))) return Number(nameOrIndex)

  const query = String(nameOrIndex).toLowerCase()
  const exact = names.findIndex((n) => n.toLowerCase() === query)
  if (exact !== -1) return exact

  const partial = names.findIndex((n) => n.toLowerCase().includes(query))
  if (partial !== -1) return partial

  throw new Error(`No SoundFont matching "${nameOrIndex}"`)
}
