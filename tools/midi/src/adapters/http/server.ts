import http from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

import type { Engine } from '../../core/engine.ts'
import { collectFiles } from '../fs/tracks.ts'
import { MIDI_TOOL_DIR } from '../fs/paths.ts'

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v]
}

function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function contentType(f: string): string {
  if (f.endsWith('.html')) return 'text/html; charset=utf-8'
  if (f.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (f.endsWith('.css')) return 'text/css; charset=utf-8'
  if (f.endsWith('.png')) return 'image/png'
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) return 'image/jpeg'
  if (f.endsWith('.gif')) return 'image/gif'
  if (f.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

/** The /api POST body: an action name plus its loosely-typed parameters. */
interface ApiMessage {
  action?: string
  name?: string
  index?: number
  on?: boolean
  paths?: string | string[]
  path?: string
  recursive?: boolean
  from?: number
  to?: number
  format?: string
  op?: string
  id?: number
  ids?: number[]
}

export function createServer(engine: Engine, port: number, { useSpa = false } = {}): http.Server {
  // Classic static page (web/) is the default. The Web Player v2 SPA
  // (web-app/dist) is opt-in via `--ui v2`; when enabled it is preferred but
  // still falls back to web/ for any path it doesn't own (e.g. /render.html,
  // which the headless renderer always loads from web/).
  const distDir = join(MIDI_TOOL_DIR, 'web-app', 'dist')
  const legacyDir = join(MIDI_TOOL_DIR, 'web')
  const roots = useSpa && existsSync(join(distDir, 'index.html')) ? [distDir, legacyDir] : [legacyDir]
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost')
    if (u.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write('\n')
      engine.clients.add(res)
      res.write(`data: ${JSON.stringify(engine.state())}\n\n`)
      req.on('close', () => engine.clients.delete(res))
      return
    }
    if (u.pathname === '/api' && req.method === 'POST') {
      let body = ''
      req.on('data', (d) => {
        body += d
      })
      req.on('end', () => {
        let m: ApiMessage = {}
        try {
          m = JSON.parse(body)
        } catch {
          /* ignore */
        }
        const fns: Record<string, () => unknown> = {
          device: () => engine.selectDevice(m.name ?? ''),
          load: () => engine.load(m.index ?? -1),
          play: () => engine.play(),
          pause: () => engine.pause(),
          next: () => engine.next(),
          prev: () => engine.prev(),
          stop: () => engine.stop(),
          repeat: () => engine.setRepeat(m.on != null ? !!m.on : !engine.repeat),
          shuffle: () => engine.setShuffle(m.on != null ? !!m.on : !engine.shuffle),
          open: () => engine.openPaths((m.paths ?? m.path)!, !!m.recursive),
          remove: () => engine.removeTrack(m.index ?? -1),
          reorder: () => engine.moveTrack(m.from ?? -1, m.to ?? -1),
          save: () => engine.savePlaylist(m.path ?? '', m.format),
        }
        const fn = m.action ? fns[m.action] : undefined
        const result = fn ? fn() : undefined
        if (result && typeof result === 'object') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } else {
          res.writeHead(200)
          res.end('ok')
        }
      })
      return
    }
    if (u.pathname === '/api/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(engine.config ?? {}))
      return
    }
    if (u.pathname === '/api/midi') {
      // Serve a track's raw MIDI bytes so the in-browser SoundFont sequencer
      // (ODM-5) can load and play it client-side.
      const i = Number(u.searchParams.get('index'))
      const track = engine.playlist[Number.isInteger(i) ? i : engine.index]
      if (track) {
        try {
          const data = readFileSync(track.path)
          res.writeHead(200, { 'Content-Type': 'audio/midi' })
          res.end(data)
          return
        } catch {
          /* fall through to 404 */
        }
      }
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (u.pathname === '/api/library/upload' && req.method === 'POST' && engine.library) {
      const chunks: Buffer[] = []
      req.on('data', (d) => chunks.push(d))
      req.on('end', async () => {
        try {
          const buf = Buffer.concat(chunks)
          const name = String(req.headers['x-filename'] || 'upload.mid').replace(/[^\w.\- ]/g, '_')
          // Content-addressed: identical bytes hash to the same file, so a
          // re-drop never duplicates on disk or in the library (deduped by path).
          const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16)
          mkdirSync(engine.uploadsDir!, { recursive: true })
          const dest = join(engine.uploadsDir!, `${hash}-${name}`)
          if (!existsSync(dest)) writeFileSync(dest, buf)
          const entry = await engine.library!.add(dest, { addedAt: Date.now() })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, entry }))
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
      return
    }
    if (u.pathname === '/api/library' && engine.library) {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ entries: engine.library.list(u.searchParams.get('q')) }))
        return
      }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (d) => {
          body += d
        })
        req.on('end', async () => {
          let m: ApiMessage = {}
          try {
            m = JSON.parse(body)
          } catch {
            /* ignore */
          }
          let result: Record<string, unknown> = { ok: false }
          try {
            if (m.op === 'add') {
              const files = collectFiles(arr(m.paths ?? m.path).filter(Boolean) as string[], !!m.recursive)
              const added = await engine.library!.addMany(files, { addedAt: Date.now() })
              result = { ok: true, added: added.length, total: engine.library!.list().length }
            } else if (m.op === 'remove') {
              result = { ok: await engine.library!.remove(m.id ?? -1) }
            } else if (m.op === 'play') {
              const ids = new Set(arr(m.ids))
              const paths = engine
                .library!.list()
                .filter((e) => ids.has(e.id))
                .map((e) => e.path)
              engine.openPaths(paths)
              result = { ok: true, count: paths.length }
            }
          } catch (e) {
            result = { ok: false, error: (e as Error).message }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })
        return
      }
    }
    if (u.pathname === '/art' && engine.artPath) {
      try {
        const data = readFileSync(engine.artPath)
        res.writeHead(200, { 'Content-Type': contentType(engine.artPath) })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end()
      }
      return
    }
    const rel = u.pathname === '/' ? '/index.html' : u.pathname
    let data: Buffer | undefined
    let file: string | undefined
    for (const root of roots) {
      const candidate = join(root, rel)
      if (!candidate.startsWith(root)) continue // path-traversal guard
      try {
        data = readFileSync(candidate)
        file = candidate
        break
      } catch {
        /* try the next root */
      }
    }
    if (data == null || file == null) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (file.endsWith('.html')) {
      const layout = engine.layout || 'normal'
      const theme = engine.theme || 'green'
      const title = engine.title || 'OPL · MIDI PLAYER'
      data = Buffer.from(
        String(data)
          .replace('<html lang="en">', `<html lang="en" data-theme="${theme}" data-layout="${layout}">`)
          .replaceAll('{{TITLE}}', escapeHtml(title)),
      )
    }
    res.writeHead(200, { 'Content-Type': contentType(file) })
    res.end(data)
  })
  server.listen(port)
  return server
}

// Resolve the requested UI ('classic' default, 'v2' opt-in) and make sure the
// SPA bundle exists. If v2 is requested but unbuilt, try a one-time build; on
// failure, fall back to classic so `opl serve` always shows *something*.
export function ensureWebUi(wantV2: boolean): boolean {
  if (!wantV2) return false
  const appDir = join(MIDI_TOOL_DIR, 'web-app')
  if (existsSync(join(appDir, 'dist', 'index.html'))) return true
  if (!existsSync(join(appDir, 'node_modules'))) {
    console.error('--ui v2: web-app deps not installed; run `npm install` in tools/midi/web-app. Using classic UI.')
    return false
  }
  try {
    console.log('Building Web Player v2 (first run)…')
    execSync('npm run build', { cwd: appDir, stdio: 'ignore' })
    return existsSync(join(appDir, 'dist', 'index.html'))
  } catch {
    console.error('--ui v2: build failed; using classic UI.')
    return false
  }
}
