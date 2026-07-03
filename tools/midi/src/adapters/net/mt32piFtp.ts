import { basename } from 'node:path'
import { Client } from 'basic-ftp'

import { SOUNDFONT_DIR, isSoundFontFile, sortSoundFontNames, findSoundFontIndex } from '../../core/soundFonts.ts'

// mt32-pi's embedded FTP server (wiki: Embedded-FTP-server). Root exposes
// volumes as directories ("SD", "USB"); SoundFonts live under <volume>/soundfonts.
export const DEFAULT_FTP_PORT = 21
export const DEFAULT_FTP_USER = 'mt32-pi'
export const DEFAULT_FTP_PASSWORD = 'mt32-pi'

export interface Mt32PiFtpOptions {
  host: string
  port?: number
  user?: string
  password?: string
  disk?: string
}

async function withFtpClient<T>(opts: Mt32PiFtpOptions, fn: (client: Client) => Promise<T>): Promise<T> {
  const { host, port = DEFAULT_FTP_PORT, user = DEFAULT_FTP_USER, password = DEFAULT_FTP_PASSWORD, disk = 'sd' } = opts
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
export async function listSoundFonts(opts: Mt32PiFtpOptions): Promise<string[]> {
  return withFtpClient(opts, async (client) => {
    const entries = await client.list()
    const names = entries.filter((e) => e.isFile && isSoundFontFile(e.name)).map((e) => e.name)
    return sortSoundFontNames(names)
  })
}

/** Uploads a local SoundFont file to the device's soundfonts directory. */
export async function uploadSoundFont(opts: Mt32PiFtpOptions, localPath: string): Promise<void> {
  return withFtpClient(opts, async (client) => {
    await client.uploadFrom(localPath, basename(localPath))
  })
}

/** Resolves a name/substring/index against the device's live SoundFont list. */
export async function resolveSoundFontIndex(opts: Mt32PiFtpOptions, nameOrIndex: string | number): Promise<number> {
  const names = await listSoundFonts(opts)
  return findSoundFontIndex(names, nameOrIndex)
}
