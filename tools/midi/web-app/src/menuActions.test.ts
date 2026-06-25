import { describe, it, expect, beforeEach } from 'vitest'
import { dispatchMenuAction } from './menuActions'
import { useStore } from './store'

describe('dispatchMenuAction', () => {
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

  it('view.theme.winamp switches the theme', () => {
    dispatchMenuAction('view.theme.winamp')
    expect(useStore.getState().theme).toBe('winamp')
  })

  it('view.layout.minimized switches the layout', () => {
    dispatchMenuAction('view.layout.minimized')
    expect(useStore.getState().layout).toBe('minimized')
  })

  it('view.togglePlaylist / view.toggleEqualizer flip panel visibility', () => {
    dispatchMenuAction('view.togglePlaylist')
    dispatchMenuAction('view.toggleEqualizer')
    expect(useStore.getState().showPlaylist).toBe(false)
    expect(useStore.getState().showEqualizer).toBe(false)
  })

  it('File/Edit placeholders do not throw and leave UI prefs unchanged', () => {
    dispatchMenuAction('file.openPlaylist')
    dispatchMenuAction('edit.remove')
    expect(useStore.getState().theme).toBe('green')
    expect(useStore.getState().showPlaylist).toBe(true)
  })
})
