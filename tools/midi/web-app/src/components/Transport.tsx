import { api } from '../lib/api'
import { useStore } from '../store'

export default function Transport() {
  const player = useStore((s) => s.player)
  const playing = player?.playing ?? false

  return (
    <div className="transport">
      <button type="button" onClick={() => api('prev')} aria-label="Previous">
        ⏮
      </button>
      <button type="button" onClick={() => api(playing ? 'pause' : 'play')} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>
      <button type="button" onClick={() => api('stop')} aria-label="Stop">
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
