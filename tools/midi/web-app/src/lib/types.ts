// Wire protocol shared with the Node backend (tools/midi/opl.mjs → Engine.state()/broadcast()).

export interface PlaylistItem {
  i: number
  name: string
  folder: string
}

export interface PlayerState {
  type: 'state'
  devices: string[]
  device: string | null
  playlist: PlaylistItem[]
  index: number
  playing: boolean
  repeat: boolean
  shuffle: boolean
  duration: number
  position: number
}

export interface NoteEvent {
  type: 'ev'
  k: 'on' | 'off' | 'cc'
  c: number
  a: number
  b: number
}

export interface PosEvent {
  type: 'pos'
  t: number
  d: number
}

export interface ResetEvent {
  type: 'reset'
}

export type ServerEvent = PlayerState | NoteEvent | PosEvent | ResetEvent

export interface LibraryEntry {
  id: number
  path: string
  name: string
  folder: string
  addedAt: number | null
  tags: string[]
}
