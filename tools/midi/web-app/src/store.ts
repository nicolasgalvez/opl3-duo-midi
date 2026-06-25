import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlayerState, LibraryEntry } from './lib/types'
import { DEFAULT_CONFIG, type AppConfig } from './lib/config'

export type Theme = 'green' | 'winamp'
export type Layout = 'normal' | 'minimized' | 'overlay'
export type DialogKind = null | 'open' | 'save'
export type OutputMode = 'hardware' | 'soundfont'

export interface AppState {
  // ── persisted UI preferences ──
  theme: Theme
  layout: Layout
  showPlaylist: boolean
  showEqualizer: boolean
  showLibrary: boolean
  outputMode: OutputMode
  // ── persisted playback memory (for restore-on-reload) ──
  lastIndex: number
  lastPosition: number
  // ── live, non-persisted server state ──
  player: PlayerState | null
  library: LibraryEntry[]
  config: AppConfig
  livePosition: number
  liveDuration: number
  dialog: DialogKind

  setTheme: (t: Theme) => void
  setLayout: (l: Layout) => void
  togglePlaylist: () => void
  toggleEqualizer: () => void
  toggleLibrary: () => void
  setLibrary: (entries: LibraryEntry[]) => void
  setOutputMode: (m: OutputMode) => void
  setConfig: (c: AppConfig) => void
  rememberPlayback: (index: number, position: number) => void
  setPlayer: (p: PlayerState) => void
  setLive: (position: number, duration: number) => void
  setDialog: (d: DialogKind) => void
}

export const PERSIST_KEY = 'opl-web-ui'

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'green',
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
      dialog: null,

      setTheme: (theme) => set({ theme }),
      setLayout: (layout) => set({ layout }),
      togglePlaylist: () => set((s) => ({ showPlaylist: !s.showPlaylist })),
      toggleEqualizer: () => set((s) => ({ showEqualizer: !s.showEqualizer })),
      toggleLibrary: () => set((s) => ({ showLibrary: !s.showLibrary })),
      setLibrary: (library) => set({ library }),
      setOutputMode: (outputMode) => set({ outputMode }),
      setConfig: (config) => set({ config }),
      rememberPlayback: (lastIndex, lastPosition) => set({ lastIndex, lastPosition }),
      setPlayer: (player) => set({ player }),
      setLive: (livePosition, liveDuration) => set({ livePosition, liveDuration }),
      setDialog: (dialog) => set({ dialog }),
    }),
    {
      name: PERSIST_KEY,
      // Only UI prefs + playback memory persist; live server state never does.
      partialize: (s) => ({
        theme: s.theme,
        layout: s.layout,
        showPlaylist: s.showPlaylist,
        showEqualizer: s.showEqualizer,
        showLibrary: s.showLibrary,
        outputMode: s.outputMode,
        lastIndex: s.lastIndex,
        lastPosition: s.lastPosition,
      }),
    },
  ),
)
