import { basename, extname } from 'node:path'
import { Client } from 'basic-ftp'

// mt32-pi's embedded FTP server (wiki: Embedded-FTP-server). Root exposes
// volumes as directories ("SD", "USB"); SoundFonts live under <volume>/soundfonts.
export const DEFAULT_FTP_PORT = 21
export const DEFAULT_FTP_USER = 'mt32-pi'
export const DEFAULT_FTP_PASSWORD = 'mt32-pi'
export const SOUNDFONT_DIR = 'soundfonts'

// The device validates candidate files by their RIFF/sfbk header content, not
// extension (src/soundfontmanager.cpp: CheckSoundFont), so it silently skips
// anything that isn't a real SoundFont (e.g. the "place-soundfonts-here.txt"
// placeholder it ships with). We can't cheaply replicate a content check over
// FTP, so filter by the extensions the device's own docs tell users to use —
// this matches real-world directories and keeps the computed index in sync.
const SOUNDFONT_EXTENSIONS = new Set(['.sf2', '.sf3'])

function strcasecmp(a, b) {
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  return al < bl ? -1 : al > bl ? 1 : 0
}

export function isSoundFontFile(name) {
  return SOUNDFONT_EXTENSIONS.has(extname(name).toLowerCase())
}

// Reproduces mt32-pi's own sort (src/soundfontmanager.cpp:
// SoundFontListComparator -> strcasecmp on path) so the computed index here
// matches the index the device assigns internally after ScanSoundFonts().
export function sortSoundFontNames(names) {
  return [...names].sort(strcasecmp)
}

// Resolves a CLI-friendly name/substring/index into the device's SoundFont
// index. `names` must already be sorted with sortSoundFontNames().
export function findSoundFontIndex(names, nameOrIndex) {
  if (/^\d+$/.test(String(nameOrIndex))) return Number(nameOrIndex)

  const query = String(nameOrIndex).toLowerCase()
  const exact = names.findIndex((n) => n.toLowerCase() === query)
  if (exact !== -1) return exact

  const partial = names.findIndex((n) => n.toLowerCase().includes(query))
  if (partial !== -1) return partial

  throw new Error(`No SoundFont matching "${nameOrIndex}"`)
}

async function withFtpClient(
  { host, port = DEFAULT_FTP_PORT, user = DEFAULT_FTP_USER, password = DEFAULT_FTP_PASSWORD, disk = 'sd' },
  fn,
) {
  const client = new Client()
  try {
    await client.access({ host, port, user, password, secure: false })
    await client.cd(`/${disk.toUpperCase()}/${SOUNDFONT_DIR}`)
    return await fn(client)
  } finally {
    client.close()
  }
}

/** Sorted SoundFont filenames on the device, in the same order the device itself uses for SwitchSoundFont(index). */
export async function listSoundFonts(opts) {
  return withFtpClient(opts, async (client) => {
    const entries = await client.list()
    const names = entries.filter((e) => e.isFile && isSoundFontFile(e.name)).map((e) => e.name)
    return sortSoundFontNames(names)
  })
}

/** Uploads a local SoundFont file to the device's soundfonts directory. */
export async function uploadSoundFont(opts, localPath) {
  return withFtpClient(opts, async (client) => {
    await client.uploadFrom(localPath, basename(localPath))
  })
}

/** Resolves a name/substring/index against the device's live SoundFont list. */
export async function resolveSoundFontIndex(opts, nameOrIndex) {
  const names = await listSoundFonts(opts)
  return findSoundFontIndex(names, nameOrIndex)
}
