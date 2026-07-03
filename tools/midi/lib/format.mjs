// Shared file-format detection by magic bytes (never by extension/filename —
// a VGM renamed to .mid must still be detected as vgm). Add future formats
// (IMF/DRO) here as more entries in DETECTORS.

function fourCc(buf, offset) {
  return buf.length >= offset + 4 ? buf.toString('ascii', offset, offset + 4) : ''
}

const DETECTORS = [
  { format: 'midi', test: (buf) => fourCc(buf, 0) === 'MThd' || fourCc(buf, 0) === 'RIFF' },
  { format: 'vgm', test: (buf) => fourCc(buf, 0) === 'Vgm ' },
]

/** Detect a track's format from its content. Returns null if unrecognized. */
export function detectFormat(buf) {
  for (const { format, test } of DETECTORS) {
    if (test(buf)) return format
  }
  return null
}
