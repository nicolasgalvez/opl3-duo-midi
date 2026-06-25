import { api } from '../lib/api'
import { useStore } from '../store'

export default function Playlist() {
  const player = useStore((s) => s.player)
  const items = player?.playlist ?? []

  return (
    <ul className="playlist">
      {items.map((it) => (
        <li key={it.i} className={it.i === player?.index ? 'current' : ''}>
          <button type="button" onClick={() => api('load', { index: it.i })}>
            <span className="pl-name">{it.name}</span>
            <span className="pl-folder">{it.folder}</span>
          </button>
        </li>
      ))}
      {items.length === 0 && <li className="empty">No tracks loaded</li>}
    </ul>
  )
}
