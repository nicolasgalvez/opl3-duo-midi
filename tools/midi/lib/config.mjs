import { readFileSync } from 'node:fs'
import { z } from 'zod'

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
    layout: z.enum(['normal', 'minimized', 'overlay']).default('normal'),
    output: z.enum(['hardware', 'soundfont']).default('hardware'),
    features: FeaturesSchema,
  })
  .strict()

export const PRESETS = {
  full: {},
  'player-only': {
    layout: 'minimized',
    output: 'soundfont',
    features: { menu: false, library: false, edit: false, devicePicker: false, outputPicker: false, playlist: true },
  },
}

export function validateConfig(raw) {
  const result = ConfigSchema.safeParse(raw ?? {})
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new Error(`invalid config: ${msg}`)
  }
  return result.data
}

export function presetConfig(name) {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) {
    throw new Error(`unknown preset: ${name} (have: ${Object.keys(PRESETS).join(', ')})`)
  }
  return validateConfig(PRESETS[name])
}

export function loadConfigFile(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`config file not found: ${path}`, { cause: e })
  }
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new Error(`config is not valid JSON (${path}): ${e.message}`, { cause: e })
  }
  // A config file may name a preset to extend.
  if (raw && typeof raw === 'object' && raw.preset) {
    const base = PRESETS[raw.preset]
    if (!base) throw new Error(`unknown preset: ${raw.preset}`)
    const over = { ...raw }
    delete over.preset
    raw = { ...base, ...over, features: { ...(base.features || {}), ...(over.features || {}) } }
  }
  return validateConfig(raw)
}

/** Resolve config from a preset name or a file path (preset takes precedence). */
export function resolveConfig({ preset, file } = {}) {
  if (preset) return presetConfig(preset)
  if (file) return Object.prototype.hasOwnProperty.call(PRESETS, file) ? presetConfig(file) : loadConfigFile(file)
  return validateConfig({})
}
