import type { Theme, Layout, OutputMode } from '../store'

// Mirrors the backend config (tools/midi/lib/config.mjs), served at /api/config.

export interface Features {
  menu: boolean
  playlist: boolean
  library: boolean
  edit: boolean
  devicePicker: boolean
  outputPicker: boolean
}

export interface AppConfig {
  title: string
  theme: Theme
  layout: Layout
  output: OutputMode
  features: Features
}

export const DEFAULT_CONFIG: AppConfig = {
  title: 'OPL · MIDI PLAYER',
  theme: 'green',
  layout: 'normal',
  output: 'hardware',
  features: { menu: true, playlist: true, library: true, edit: true, devicePicker: true, outputPicker: true },
}

export async function fetchConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/api/config')
    if (!res.ok) return DEFAULT_CONFIG
    const c = (await res.json()) as Partial<AppConfig>
    return {
      ...DEFAULT_CONFIG,
      ...c,
      features: { ...DEFAULT_CONFIG.features, ...(c.features ?? {}) },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}
