import { useStore } from '../store'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export default function NowPlaying() {
  const player = useStore((s) => s.player)
  const position = useStore((s) => s.livePosition)
  const duration = useStore((s) => s.liveDuration)
  const cur = player ? player.playlist[player.index] : undefined
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <div className="nowplaying">
      <div className="np-name">{cur?.name ?? '—'}</div>
      <div className="np-folder">{cur?.folder ?? ''}</div>
      <div className="seek" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="seek-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="np-time">
        {fmt(position)} / {fmt(duration)}
      </div>
    </div>
  )
}
