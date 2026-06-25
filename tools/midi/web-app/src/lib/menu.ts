import { THEMES, type ThemeName } from './themes'

// Desktop-style menu bar modelled as data so the UI renders from it and tests
// can assert its structure. Each item carries a stable action id.

export type MenuActionId =
  | 'file.openFolder'
  | 'file.openFiles'
  | 'file.openPlaylist'
  | 'file.savePlaylist'
  | 'edit.remove'
  | 'edit.moveUp'
  | 'edit.moveDown'
  | `view.theme.${ThemeName}`
  | 'view.layout.normal'
  | 'view.layout.minimized'
  | 'view.layout.overlay'
  | 'view.togglePlaylist'
  | 'view.toggleEqualizer'
  | 'view.toggleLibrary'
  | 'view.fullscreen'

export interface MenuItem {
  id: MenuActionId
  label: string
}

export interface Menu {
  title: string
  items: MenuItem[]
}

// Theme options are generated from the registry so adding a WCAG-AA theme in
// themes.ts surfaces it in the menu automatically.
const themeItems: MenuItem[] = THEMES.map((t) => ({
  id: `view.theme.${t.name}` as MenuActionId,
  label: `Theme: ${t.label}`,
}))

export const MENUS: Menu[] = [
  {
    title: 'File',
    items: [
      { id: 'file.openFolder', label: 'Open Folder…' },
      { id: 'file.openFiles', label: 'Open File(s)…' },
      { id: 'file.openPlaylist', label: 'Open Playlist… (.m3u / .jspf)' },
      { id: 'file.savePlaylist', label: 'Save Playlist…' },
    ],
  },
  {
    title: 'Edit',
    items: [
      { id: 'edit.remove', label: 'Remove Current Track' },
      { id: 'edit.moveUp', label: 'Move Current Up' },
      { id: 'edit.moveDown', label: 'Move Current Down' },
    ],
  },
  {
    title: 'View',
    items: [
      ...themeItems,
      { id: 'view.layout.normal', label: 'Layout: Normal' },
      { id: 'view.layout.minimized', label: 'Layout: Minimized' },
      { id: 'view.layout.overlay', label: 'Layout: Overlay' },
      { id: 'view.togglePlaylist', label: 'Toggle Playlist' },
      { id: 'view.toggleEqualizer', label: 'Toggle Equalizer' },
      { id: 'view.toggleLibrary', label: 'Toggle Library' },
      { id: 'view.fullscreen', label: 'Fullscreen' },
    ],
  },
]
