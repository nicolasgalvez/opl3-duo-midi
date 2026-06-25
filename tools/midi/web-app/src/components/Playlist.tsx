import { api } from '../lib/api'
import { useStore } from '../store'

export default function Playlist() {
  const player = useStore((s) => s.player)
  const editable = useStore((s) => s.config.features.edit)
  const items = player?.playlist ?? []
  const last = items.length - 1

  return (
    <ul className="playlist">
      {items.map((it) => (
        <li key={it.i} className={it.i === player?.index ? 'current' : ''}>
          <button type="button" className="pl-main" onClick={() => api('load', { index: it.i })}>
            <span className="pl-name">{it.name}</span>
            <span className="pl-folder">{it.folder}</span>
          </button>
          {editable && (
            <span className="pl-controls">
              <button
                type="button"
                aria-label={`Move ${it.name} up`}
                disabled={it.i === 0}
                onClick={() => api('reorder', { from: it.i, to: it.i - 1 })}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`Move ${it.name} down`}
                disabled={it.i === last}
                onClick={() => api('reorder', { from: it.i, to: it.i + 1 })}
              >
                ▼
              </button>
              <button type="button" aria-label={`Remove ${it.name}`} onClick={() => api('remove', { index: it.i })}>
                ✕
              </button>
            </span>
          )}
        </li>
      ))}
      {items.length === 0 && <li className="empty">No tracks loaded</li>}
    </ul>
  )
}
