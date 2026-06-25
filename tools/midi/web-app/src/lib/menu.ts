// Desktop-style menu bar modelled as data so the UI renders from it and tests
// can assert its structure. Each item carries a stable action id dispatched by
// the MenuBar component.

export type MenuActionId =
  | 'file.openFolder'
  | 'file.openFiles'
  | 'file.openPlaylist'
  | 'file.savePlaylist'
  | 'edit.remove'
  | 'edit.moveUp'
  | 'edit.moveDown'
  | 'view.theme.green'
  | 'view.theme.winamp'
  | 'view.layout.normal'
  | 'view.layout.minimized'
  | 'view.layout.overlay'
  | 'view.togglePlaylist'
  | 'view.toggleEqualizer'
  | 'view.fullscreen'

export interface MenuItem {
  id: MenuActionId
  label: string
}

export interface Menu {
  title: string
  items: MenuItem[]
}

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
      { id: 'view.theme.green', label: 'Theme: Green CRT' },
      { id: 'view.theme.winamp', label: 'Theme: Winamp' },
      { id: 'view.layout.normal', label: 'Layout: Normal' },
      { id: 'view.layout.minimized', label: 'Layout: Minimized' },
      { id: 'view.layout.overlay', label: 'Layout: Overlay' },
      { id: 'view.togglePlaylist', label: 'Toggle Playlist' },
      { id: 'view.toggleEqualizer', label: 'Toggle Equalizer' },
      { id: 'view.fullscreen', label: 'Fullscreen' },
    ],
  },
]
