import type { MenuActionId } from './lib/menu'
import { useStore } from './store'

/**
 * Apply a menu action. View actions are fully wired (theme/layout/panels/
 * fullscreen); File/Edit actions are placeholders until the backend gains
 * open/save + edit endpoints in a later ODM-3 slice.
 */
export function dispatchMenuAction(id: MenuActionId): void {
  const s = useStore.getState()
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
    case 'view.fullscreen':
      if (typeof document !== 'undefined') {
        if (document.fullscreenElement) void document.exitFullscreen?.()
        else void document.documentElement.requestFullscreen?.()
      }
      break
    case 'file.openFolder':
    case 'file.openFiles':
    case 'file.openPlaylist':
    case 'file.savePlaylist':
    case 'edit.reorder':
    case 'edit.rename':
    case 'edit.remove':
      // Not yet wired — needs backend open/save + playlist-edit endpoints.
      break
  }
}
