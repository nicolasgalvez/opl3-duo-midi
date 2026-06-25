import type { MenuActionId } from './lib/menu'
import { api } from './lib/api'
import { useStore } from './store'

/**
 * Apply a menu action.
 * - View: theme/layout/panels/fullscreen (local UI state).
 * - File: open/save a dialog that collects a path, then calls the backend.
 * - Edit: act on the current track via the backend (remove / move up / down).
 */
export function dispatchMenuAction(id: MenuActionId): void {
  const s = useStore.getState()
  const index = s.player?.index ?? -1
  const len = s.player?.playlist.length ?? 0

  switch (id) {
    case 'view.theme.green':
      s.setTheme('green')
      break
    case 'view.theme.winamp':
      s.setTheme('winamp')
      break
    case 'view.layout.normal':
      s.setLayout('normal')
      break
    case 'view.layout.minimized':
      s.setLayout('minimized')
      break
    case 'view.layout.overlay':
      s.setLayout('overlay')
      break
    case 'view.togglePlaylist':
      s.togglePlaylist()
      break
    case 'view.toggleEqualizer':
      s.toggleEqualizer()
      break
    case 'view.toggleLibrary':
      s.toggleLibrary()
      break
    case 'view.fullscreen':
      if (typeof document !== 'undefined') {
        if (document.fullscreenElement) void document.exitFullscreen?.()
        else void document.documentElement.requestFullscreen?.()
      }
      break

    case 'file.openFolder':
    case 'file.openFiles':
    case 'file.openPlaylist':
      s.setDialog('open')
      break
    case 'file.savePlaylist':
      s.setDialog('save')
      break

    case 'edit.remove':
      if (index >= 0) void api('remove', { index })
      break
    case 'edit.moveUp':
      if (index > 0) void api('reorder', { from: index, to: index - 1 })
      break
    case 'edit.moveDown':
      if (index >= 0 && index < len - 1) void api('reorder', { from: index, to: index + 1 })
      break
  }
}
