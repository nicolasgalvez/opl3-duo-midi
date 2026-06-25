/** Legacy aspect-ratio presets (used by --ratio). */
export const RATIOS = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
}

/** Platform + aspect presets for social video export. */
export const PLATFORM_PRESETS = {
  youtube: {
    landscape: { w: 1920, h: 1080 },
    portrait: { w: 1080, h: 1920 },
  },
  instagram: {
    square: { w: 1080, h: 1080 },
    portrait: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
  },
}

function parseResolution(s) {
  const parts = String(s)
    .split('x')
    .map((n) => parseInt(n, 10))
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid resolution "${s}". Use WxH, e.g. 1920x1080.`)
  }
  return { w: parts[0], h: parts[1] }
}

/** Resolve output dimensions: --resolution > --platform+--aspect > --ratio > 16:9 default. */
export function resolveDimensions(argv = {}, env = process.env) {
  if (argv.resolution) return parseResolution(argv.resolution)

  const platform = (argv.platform || env.OPL_PLATFORM || '').toLowerCase()
  const aspect = (argv.aspect || env.OPL_ASPECT || '').toLowerCase()

  if (platform || aspect) {
    if (!platform || !aspect) {
      throw new Error('Both --platform and --aspect are required (or set OPL_PLATFORM and OPL_ASPECT).')
    }
    const presets = PLATFORM_PRESETS[platform]
    if (!presets) {
      throw new Error(`Unknown platform "${platform}". Use: ${Object.keys(PLATFORM_PRESETS).join(', ')}`)
    }
    const dims = presets[aspect]
    if (!dims) {
      throw new Error(`Unknown aspect "${aspect}" for ${platform}. Use: ${Object.keys(presets).join(', ')}`)
    }
    return { ...dims }
  }

  const ratio = argv.ratio || '16:9'
  const dims = RATIOS[ratio]
  if (!dims) {
    throw new Error(`Unknown ratio "${ratio}". Use: ${Object.keys(RATIOS).join(', ')}`)
  }
  return { ...dims }
}
