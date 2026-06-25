import { useStore } from '../store'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export default function NowPlaying() {
  const player = useStore((s) => s.player)
  const cur = player ? player.playlist[player.index] : undefined

  return (
    <div className="nowplaying">
      <div className="np-name">{cur?.name ?? '—'}</div>
      <div className="np-folder">{cur?.folder ?? ''}</div>
      <div className="np-time">
        {fmt(player?.position ?? 0)} / {fmt(player?.duration ?? 0)}
      </div>
    </div>
  )
}
