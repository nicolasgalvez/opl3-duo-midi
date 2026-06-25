/** Milliseconds to shift A/V sync at mux time (+ delays audio, − delays video). */
export function resolveAvOffset(argv = {}, env = process.env) {
  if (argv.avOffset != null && argv.avOffset !== '') return Number(argv.avOffset) || 0
  if (env.OPL_AV_OFFSET != null && env.OPL_AV_OFFSET !== '') return Number(env.OPL_AV_OFFSET) || 0
  return 0
}

/** Build ffmpeg args to mux video + audio with optional sync offset. */
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
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
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
