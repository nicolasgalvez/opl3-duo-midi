import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, PERSIST_KEY } from './store'
import type { PlayerState } from './lib/types'
import { DEFAULT_CONFIG } from './lib/config'

function persisted(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}').state ?? {}
}

describe('store', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      theme: 'green',
      themeUserSet: false,
      layout: 'normal',
      showPlaylist: true,
      showEqualizer: true,
      showLibrary: false,
      outputMode: 'hardware',
      lastIndex: 0,
      lastPosition: 0,
      player: null,
      library: [],
      config: DEFAULT_CONFIG,
      livePosition: 0,
      liveDuration: 0,
    })
  })

  it('setTheme updates state and writes through to localStorage', () => {
    useStore.getState().setTheme('winamp')
    expect(useStore.getState().theme).toBe('winamp')
    expect(persisted().theme).toBe('winamp')
  })

  it('chooseTheme records an explicit user choice (themeUserSet) and persists it', () => {
    expect(useStore.getState().themeUserSet).toBe(false)
    useStore.getState().chooseTheme('win98')
    expect(useStore.getState().theme).toBe('win98')
    expect(useStore.getState().themeUserSet).toBe(true)
    expect(persisted().theme).toBe('win98')
    expect(persisted().themeUserSet).toBe(true)
  })

  it('setLayout persists', () => {
    useStore.getState().setLayout('overlay')
    expect(persisted().layout).toBe('overlay')
  })

  it('panel toggles flip and persist', () => {
    useStore.getState().togglePlaylist()
    useStore.getState().toggleEqualizer()
    expect(useStore.getState().showPlaylist).toBe(false)
    expect(useStore.getState().showEqualizer).toBe(false)
    expect(persisted().showPlaylist).toBe(false)
  })

  it('remembers the current track index and position for restore-on-reload', () => {
    useStore.getState().rememberPlayback(3, 12.5)
    expect(persisted().lastIndex).toBe(3)
    expect(persisted().lastPosition).toBe(12.5)
  })

  it('toggleLibrary flips and persists; setLibrary updates in memory only', () => {
    useStore.getState().toggleLibrary()
    expect(useStore.getState().showLibrary).toBe(true)
    expect(persisted().showLibrary).toBe(true)

    useStore.getState().setLibrary([
      { id: 1, path: '/m/a.mid', name: 'a.mid', folder: 'm', addedAt: 1, tags: [] },
    ])
    expect(useStore.getState().library).toHaveLength(1)
    expect('library' in persisted()).toBe(false)
  })

  it('setConfig updates the runtime config but does not persist it (server-driven)', () => {
    const playerOnly = {
      ...DEFAULT_CONFIG,
      output: 'soundfont' as const,
      features: { ...DEFAULT_CONFIG.features, menu: false, library: false, edit: false },
    }
    useStore.getState().setConfig(playerOnly)
    expect(useStore.getState().config.features.menu).toBe(false)
    expect('config' in persisted()).toBe(false)
  })

  it('setOutputMode switches and persists the output mode', () => {
    useStore.getState().setOutputMode('soundfont')
    expect(useStore.getState().outputMode).toBe('soundfont')
    expect(persisted().outputMode).toBe('soundfont')
  })

  it('setLive updates the live position/duration without persisting them', () => {
    useStore.getState().setLive(12.5, 60)
    expect(useStore.getState().livePosition).toBe(12.5)
    expect(useStore.getState().liveDuration).toBe(60)
    expect('livePosition' in persisted()).toBe(false)
  })

  it('keeps live player state in memory but never persists it', () => {
    const p: PlayerState = {
      type: 'state',
      devices: ['OPL3Duo MIDI'],
      device: 'OPL3Duo MIDI',
      playlist: [{ i: 0, name: 'a.mid', folder: 'set' }],
      index: 0,
      playing: true,
      repeat: false,
      shuffle: false,
      duration: 10,
      position: 1,
    }
    useStore.getState().setPlayer(p)
    expect(useStore.getState().player?.device).toBe('OPL3Duo MIDI')
    expect('player' in persisted()).toBe(false)
  })
})
