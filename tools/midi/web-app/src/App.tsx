import { useEffect } from 'react'
import { connectEvents } from './lib/sse'
import { useStore } from './store'
import { fetchConfig } from './lib/config'
import MenuBar from './components/MenuBar'
import Equalizer from './components/Equalizer'
import Transport from './components/Transport'
import Playlist from './components/Playlist'
import NowPlaying from './components/NowPlaying'
import DevicePicker from './components/DevicePicker'
import OutputPicker from './components/OutputPicker'
import FileDialogs from './components/FileDialogs'
import Library from './components/Library'
import SoundfontController from './components/SoundfontController'
import { fetchLibrary } from './lib/libraryApi'

export default function App() {
  const theme = useStore((s) => s.theme)
  const layout = useStore((s) => s.layout)
  const showPlaylist = useStore((s) => s.showPlaylist)
  const showEqualizer = useStore((s) => s.showEqualizer)
  const showLibrary = useStore((s) => s.showLibrary)
  const features = useStore((s) => s.config.features)
  const setPlayer = useStore((s) => s.setPlayer)
  const rememberPlayback = useStore((s) => s.rememberPlayback)
  const setLive = useStore((s) => s.setLive)
  const setLibrary = useStore((s) => s.setLibrary)

  // Runtime config drives feature flags + defaults. For a restricted/embedded
  // config (no menu) it also drives theme/layout/output; a locked output is
  // always forced. The full local tool keeps the user's persisted prefs.
  useEffect(() => {
    fetchConfig().then((cfg) => {
      const s = useStore.getState()
      s.setConfig(cfg)
      document.title = cfg.title
      // Apply server-driven values when they differ from the schema default
      // (explicit --theme/--layout, preset, or config file); otherwise the
      // user's persisted prefs win. A locked output is always forced.
      if (cfg.theme !== 'green') s.setTheme(cfg.theme)
      if (cfg.layout !== 'normal') s.setLayout(cfg.layout)
      if (cfg.output !== 'hardware' || !cfg.features.outputPicker) s.setOutputMode(cfg.output)
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.layout = layout
  }, [layout])

  useEffect(() => {
    return connectEvents((e) => {
      if (e.type === 'state') {
        setPlayer(e)
        setLive(e.position, e.duration)
        rememberPlayback(e.index, e.position)
      } else if (e.type === 'pos') {
        setLive(e.t, e.d)
      }
    })
  }, [setPlayer, rememberPlayback, setLive])

  useEffect(() => {
    if (features.library) fetchLibrary('').then(setLibrary)
  }, [features.library, setLibrary])

  useEffect(() => {
    const save = () => {
      const p = useStore.getState().player
      if (p) rememberPlayback(p.index, p.position)
    }
    window.addEventListener('beforeunload', save)
    return () => window.removeEventListener('beforeunload', save)
  }, [rememberPlayback])

  return (
    <div className="app">
      <header className="topbar">
        {features.menu ? <MenuBar /> : <div className="brand">{useStore.getState().config.title}</div>}
        <div className="outputs">
          {features.outputPicker && <OutputPicker />}
          {features.devicePicker && <DevicePicker />}
        </div>
      </header>
      <main className="content">
        {showEqualizer && (
          <section className="panel eq-panel">
            <NowPlaying />
            <Equalizer />
            <Transport />
          </section>
        )}
        {features.playlist && showPlaylist && (
          <aside className="panel playlist-panel">
            <div className="panel-title">PLAYLIST</div>
            <Playlist />
          </aside>
        )}
        {features.library && showLibrary && <Library />}
      </main>
      <SoundfontController />
      <FileDialogs />
    </div>
  )
}
