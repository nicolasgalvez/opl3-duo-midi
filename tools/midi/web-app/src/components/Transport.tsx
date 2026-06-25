import { useState } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store'
import { soundfontPlayer } from '../lib/soundfontPlayer'

export default function Transport() {
  const player = useStore((s) => s.player)
  const outputMode = useStore((s) => s.outputMode)
  const [sfPlaying, setSfPlaying] = useState(false)
  const soundfont = outputMode === 'soundfont'
  const playing = soundfont ? sfPlaying : (player?.playing ?? false)

  const togglePlay = async () => {
    if (soundfont) {
      if (sfPlaying) {
        soundfontPlayer.pause()
        setSfPlaying(false)
      } else {
        // Ensure the current track is loaded before playing (play() awaits it).
        void soundfontPlayer.loadMidiFromUrl(`/api/midi?index=${player?.index ?? 0}`)
        await soundfontPlayer.play()
        setSfPlaying(true)
      }
    } else {
      api(playing ? 'pause' : 'play')
    }
  }

  const stop = () => {
    if (soundfont) {
      soundfontPlayer.pause()
      setSfPlaying(false)
    }
    api('stop') // also resets the server-side index/position
  }

  return (
    <div className="transport">
      <button type="button" onClick={() => api('prev')} aria-label="Previous">
        ⏮
      </button>
      <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>
      <button type="button" onClick={stop} aria-label="Stop">
        ⏹
      </button>
      <button type="button" onClick={() => api('next')} aria-label="Next">
        ⏭
      </button>
      <button type="button" className={`toggle ${player?.repeat ? 'on' : ''}`} onClick={() => api('repeat')}>
        LOOP
      </button>
      <button type="button" className={`toggle ${player?.shuffle ? 'on' : ''}`} onClick={() => api('shuffle')}>
        SHUF
      </button>
    </div>
  )
}
