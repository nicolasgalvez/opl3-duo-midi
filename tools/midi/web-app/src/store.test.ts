import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, PERSIST_KEY } from './store'
import type { PlayerState } from './lib/types'

function persisted(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}').state ?? {}
}

describe('store', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      theme: 'green',
      layout: 'normal',
      showPlaylist: true,
      showEqualizer: true,
      lastIndex: 0,
      lastPosition: 0,
      player: null,
    })
  })

  it('setTheme updates state and writes through to localStorage', () => {
    useStore.getState().setTheme('winamp')
    expect(useStore.getState().theme).toBe('winamp')
    expect(persisted().theme).toBe('winamp')
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
