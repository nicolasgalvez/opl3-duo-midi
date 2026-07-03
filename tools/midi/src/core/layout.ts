import { LayoutSchema, type Layout } from '../contracts/layout.ts'

/** Resolve display layout from CLI argv and env (OPL_LAYOUT). Flag wins over env. */
export function resolveLayout(argv: { layout?: unknown } = {}, env: NodeJS.ProcessEnv = process.env): Layout {
  const raw = argv.layout || env.OPL_LAYOUT || 'normal'
  const parsed = LayoutSchema.safeParse(String(raw).toLowerCase())
  if (!parsed.success) {
    throw new Error(`Unknown layout "${raw}". Use: ${LayoutSchema.options.join(', ')}`)
  }
  return parsed.data
}
