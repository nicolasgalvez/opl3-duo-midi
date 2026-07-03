import { extname } from 'node:path'
import { JspfSchema } from '../contracts/playlist.ts'

// Established playlist formats: M3U/M3U8 (de-facto plaintext) and JSPF (the JSON
// sibling of XSPF, the open Xiph standard — https://www.xspf.org/jspf). `.json`
// is accepted as JSPF too; a non-JSPF .json simply yields no tracks.
const PLAYLIST_EXTS = ['.m3u', '.m3u8', '.jspf', '.json']

/** True when `p` names a playlist file we know how to expand. */
export function isPlaylistFile(p: string): boolean {
  return PLAYLIST_EXTS.includes(extname(p).toLowerCase())
}

/** Parse an M3U/M3U8 body into ordered track entries (paths/URIs), preserving order. */
export function parseM3U(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')) // drop blanks, #EXTM3U, #EXTINF, # comments
}

/** Parse a JSPF body into ordered track entries from `playlist.track[].location`. */
export function parseJSPF(content: string): string[] {
  const data: unknown = JSON.parse(content)
  const parsed = JspfSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('not a JSPF playlist (expected playlist.track[])')
  }
  return parsed.data.playlist.track
    .map((t) => {
      const location = (t as { location?: unknown } | null | undefined)?.location
      return Array.isArray(location) ? location[0] : location
    })
    .filter((loc): loc is string => typeof loc === 'string' && loc.length > 0)
}
