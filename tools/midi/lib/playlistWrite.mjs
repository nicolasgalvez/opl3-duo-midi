import { basename } from 'node:path'

// Writers for the two playlist formats the ODM-1 loader reads (lib/playlist.mjs).
// Kept as the exact inverse so write→read round-trips preserve track order.

/** Serialize an ordered list of track paths to an M3U/M3U8 body. */
export function toM3U(paths) {
  return ['#EXTM3U', ...paths].join('\n') + '\n'
}

/** Serialize an ordered list of track paths to a JSPF (JSON XSPF) body. */
export function toJSPF(paths, meta = {}) {
  const playlist = {
    title: meta.title || 'OPL playlist',
    creator: meta.creator || 'opl',
    track: paths.map((p) => ({ location: [p], title: basename(p) })),
  }
  return JSON.stringify({ playlist }, null, 2) + '\n'
}
