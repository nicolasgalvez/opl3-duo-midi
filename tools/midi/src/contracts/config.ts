import { z } from 'zod'
import { LayoutSchema } from './layout.ts'

// Runtime configuration for `opl serve`: drives defaults + feature flags so the
// same app runs as the full desktop tool or a stripped-down embeddable player.
// Validated with zod; unknown keys and bad values are rejected with clear errors.

const FeaturesSchema = z
  .object({
    menu: z.boolean().default(true), // File/Edit/View menu bar
    playlist: z.boolean().default(true), // playlist panel
    library: z.boolean().default(true), // library + drag-drop upload
    edit: z.boolean().default(true), // reorder/remove + Edit menu
    devicePicker: z.boolean().default(true), // hardware MIDI device picker
    outputPicker: z.boolean().default(true), // switch hardware <-> SoundFont
  })
  .strict()
  .default({})

export const ConfigSchema = z
  .object({
    title: z.string().default('OPL · MIDI PLAYER'),
    theme: z.enum(['green', 'winamp', 'win98', 'amber']).default('green'),
    layout: LayoutSchema.default('normal'),
    output: z.enum(['hardware', 'soundfont']).default('hardware'),
    features: FeaturesSchema,
  })
  .strict()

export type Config = z.infer<typeof ConfigSchema>

export const PRESETS: Record<string, z.input<typeof ConfigSchema>> = {
  full: {},
  'player-only': {
    layout: 'minimized',
    output: 'soundfont',
    features: { menu: false, library: false, edit: false, devicePicker: false, outputPicker: false, playlist: true },
  },
}

export function validateConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw ?? {})
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new Error(`invalid config: ${msg}`)
  }
  return result.data
}

export function presetConfig(name: string): Config {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) {
    throw new Error(`unknown preset: ${name} (have: ${Object.keys(PRESETS).join(', ')})`)
  }
  return validateConfig(PRESETS[name])
}
