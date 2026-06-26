/** Milliseconds to shift A/V sync at mux time (+ delays audio, − delays video). */
export function resolveAvOffset(argv = {}, env = process.env) {
  if (argv.avOffset != null && argv.avOffset !== '') return Number(argv.avOffset) || 0
  if (env.OPL_AV_OFFSET != null && env.OPL_AV_OFFSET !== '') return Number(env.OPL_AV_OFFSET) || 0
  return 0
}

/** Build ffmpeg args to mux video + audio with optional sync offset.
 *  Video is stream-copied: OBS already records constant-framerate H.264, so re-encoding
 *  (the original `-c:v libx264 -preset medium -crf 18`) only doubled wall-time at no quality
 *  gain. Copy keeps the OBS frames verbatim (same size, no 2nd-gen loss) and muxes in seconds.
 *  Original kept at lib/mux.mjs.bak. */
export function buildMuxArgs({ videoFile, audioFile, outPath, fps, avOffsetMs = 0 }) {
  const args = []
  const offsetSec = (Math.abs(avOffsetMs) / 1000).toFixed(3)

  if (avOffsetMs < 0) {
    args.push('-itsoffset', offsetSec, '-i', videoFile, '-i', audioFile)
  } else if (avOffsetMs > 0) {
    args.push('-i', videoFile, '-itsoffset', offsetSec, '-i', audioFile)
  } else {
    args.push('-i', videoFile, '-i', audioFile)
  }

  args.push(
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-shortest',
    '-y',
    outPath,
  )
  return args
}
