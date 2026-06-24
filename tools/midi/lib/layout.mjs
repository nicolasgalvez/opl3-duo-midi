const LAYOUTS = new Set(['normal', 'minimized', 'overlay'])

/** Resolve display layout from CLI argv and env (OPL_LAYOUT). Flag wins over env. */
export function resolveLayout(argv = {}, env = process.env) {
  const raw = argv.layout || env.OPL_LAYOUT || 'normal'
  const layout = String(raw).toLowerCase()
  if (!LAYOUTS.has(layout)) {
    throw new Error(`Unknown layout "${raw}". Use: ${[...LAYOUTS].join(', ')}`)
  }
  return layout
}
