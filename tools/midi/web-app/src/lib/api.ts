// Thin client for the backend control endpoint (tools/midi/opl.mjs → POST /api).

export type ApiAction =
  | 'device'
  | 'load'
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'stop'
  | 'repeat'
  | 'shuffle'

export async function api(action: ApiAction, extra: Record<string, unknown> = {}): Promise<void> {
  await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
}
