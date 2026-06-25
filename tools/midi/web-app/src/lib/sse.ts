// Live event stream from the backend (tools/midi/opl.mjs → GET /events, SSE).

import type { ServerEvent } from './types'

export function connectEvents(onEvent: (e: ServerEvent) => void): () => void {
  const es = new EventSource('/events')
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as ServerEvent)
    } catch {
      /* ignore malformed frames */
    }
  }
  return () => es.close()
}
