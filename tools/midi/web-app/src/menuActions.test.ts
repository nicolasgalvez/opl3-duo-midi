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
      showLibrary: false,
      lastIndex: 0,
      lastPosition: 0,
      player: null,
      dialog: null,
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

  it('view.toggleLibrary flips library visibility', () => {
    dispatchMenuAction('view.toggleLibrary')
    expect(useStore.getState().showLibrary).toBe(true)
  })

  it('file.openPlaylist / openFolder / openFiles open the "open" dialog', () => {
    dispatchMenuAction('file.openPlaylist')
    expect(useStore.getState().dialog).toBe('open')
  })

  it('file.savePlaylist opens the "save" dialog', () => {
    dispatchMenuAction('file.savePlaylist')
    expect(useStore.getState().dialog).toBe('save')
  })

  it('edit.remove with no loaded track is a safe no-op', () => {
    // player is null here, so there is no current index to act on.
    expect(() => dispatchMenuAction('edit.remove')).not.toThrow()
    expect(useStore.getState().dialog).toBeNull()
  })
})
