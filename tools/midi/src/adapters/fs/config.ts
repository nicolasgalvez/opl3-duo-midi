import { readFileSync } from 'node:fs'

import { PRESETS, validateConfig, presetConfig, type Config } from '../../contracts/config.ts'

export function loadConfigFile(path: string): Config {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`config file not found: ${path}`, { cause: e })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new Error(`config is not valid JSON (${path}): ${(e as Error).message}`, { cause: e })
  }
  // A config file may name a preset to extend.
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).preset) {
    const over: Record<string, unknown> = { ...raw }
    const presetName = String(over.preset)
    const base = PRESETS[presetName]
    if (!base) throw new Error(`unknown preset: ${presetName}`)
    delete over.preset
    raw = { ...base, ...over, features: { ...((base.features || {}) as object), ...((over.features || {}) as object) } }
  }
  return validateConfig(raw)
}

/** Resolve config from a preset name or a file path (preset takes precedence). */
export function resolveConfig({ preset, file }: { preset?: string; file?: string } = {}): Config {
  if (preset) return presetConfig(preset)
  if (file) return Object.prototype.hasOwnProperty.call(PRESETS, file) ? presetConfig(file) : loadConfigFile(file)
  return validateConfig({})
}
