import { useEffect } from 'react'
import { connectEvents } from './lib/sse'
import { useStore } from './store'
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
  const setPlayer = useStore((s) => s.setPlayer)
  const rememberPlayback = useStore((s) => s.rememberPlayback)
  const setLive = useStore((s) => s.setLive)
  const setLibrary = useStore((s) => s.setLibrary)

  // Persisted theme/layout drive the <html> data-attributes the CSS keys off.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.layout = layout
  }, [layout])

  // Live server state → store. Playback is server-side, so a page reload simply
  // reconnects and reflects the server's current track + position. `pos` frames
  // keep the displayed position advancing between state broadcasts.
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

  // Load the media library once on mount.
  useEffect(() => {
    fetchLibrary('').then(setLibrary)
  }, [setLibrary])

  // Capture the latest position on unload for restore-on-reload.
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
        <MenuBar />
        <div className="outputs">
          <OutputPicker />
          <DevicePicker />
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
        {showPlaylist && (
          <aside className="panel playlist-panel">
            <div className="panel-title">PLAYLIST</div>
            <Playlist />
          </aside>
        )}
        {showLibrary && <Library />}
      </main>
      <SoundfontController />
      <FileDialogs />
    </div>
  )
}
