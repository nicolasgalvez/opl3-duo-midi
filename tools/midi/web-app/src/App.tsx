import { useEffect } from 'react'
import { connectEvents } from './lib/sse'
import { useStore } from './store'
import MenuBar from './components/MenuBar'
import Equalizer from './components/Equalizer'
import Transport from './components/Transport'
import Playlist from './components/Playlist'
import NowPlaying from './components/NowPlaying'
import DevicePicker from './components/DevicePicker'
import FileDialogs from './components/FileDialogs'

export default function App() {
  const theme = useStore((s) => s.theme)
  const layout = useStore((s) => s.layout)
  const showPlaylist = useStore((s) => s.showPlaylist)
  const showEqualizer = useStore((s) => s.showEqualizer)
  const setPlayer = useStore((s) => s.setPlayer)
  const rememberPlayback = useStore((s) => s.rememberPlayback)

  // Persisted theme/layout drive the <html> data-attributes the CSS keys off.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.layout = layout
  }, [layout])

  // Live server state → store; remember index/position so a reload can restore.
  useEffect(() => {
    return connectEvents((e) => {
      if (e.type === 'state') {
        setPlayer(e)
        rememberPlayback(e.index, e.position)
      }
    })
  }, [setPlayer, rememberPlayback])

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
        <DevicePicker />
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
      </main>
      <FileDialogs />
    </div>
  )
}
