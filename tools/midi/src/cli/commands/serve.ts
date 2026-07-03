import { dirname, join } from 'node:path'

import { resetToBaseline } from '../../core/engine.ts'
import { resolveNetTarget } from '../../core/deviceTarget.ts'
import { validateConfig, type Config } from '../../contracts/config.ts'
import { resolveConfig } from '../../adapters/fs/config.ts'
import { MIDI_TOOL_DIR, resolveLib } from '../../adapters/fs/paths.ts'
import { collectFiles } from '../../adapters/fs/tracks.ts'
import { midiOutputs } from '../../adapters/midi/outputs.ts'
import { openLibrary } from '../../adapters/storage/library.ts'
import { createServer, ensureWebUi } from '../../adapters/http/server.ts'
import { createEngine } from '../wiring.ts'
import type { GlobalArgv } from '../shared.ts'

export interface ServeArgv extends GlobalArgv {
  folder?: string
  recursive: boolean
  http: number
  theme?: string
  title?: string
  layout?: string
  repeat: boolean
  loop?: boolean
  shuffle: boolean
  ui?: string
  preset?: string
  config?: string
}

export async function cmdServe(argv: ServeArgv): Promise<void> {
  const engine = createEngine()

  // Runtime config (defaults / preset / file), then CLI/env overrides so both
  // the classic page and the v2 SPA (/api/config) see --theme/--layout/--title.
  // Invalid config is fatal.
  try {
    const base = resolveConfig({ preset: argv.preset, file: argv.config || process.env.OPL_CONFIG })
    const ov: Partial<Pick<Config, 'theme' | 'layout' | 'title'>> = {}
    const theme = argv.theme || process.env.OPL_THEME
    const layout = argv.layout || process.env.OPL_LAYOUT
    const title = argv.title || process.env.OPL_TITLE
    if (theme) ov.theme = theme as Config['theme']
    if (layout) ov.layout = layout as Config['layout']
    if (title) ov.title = title
    engine.config = Object.keys(ov).length ? validateConfig({ ...base, ...ov }) : base
  } catch (e) {
    console.error('config error:', (e as Error).message)
    process.exit(1)
  }
  engine.theme = engine.config.theme
  engine.title = engine.config.title
  engine.layout = engine.config.layout
  const folder = resolveLib(argv.folder || process.cwd())
  const files = collectFiles([folder], argv.recursive)
  engine.setPlaylist(files)
  engine.repeat = !!(argv.repeat || argv.loop || process.env.OPL_REPEAT === '1' || process.env.OPL_REPEAT === 'true')
  engine.setShuffle(!!(argv.shuffle || process.env.OPL_SHUFFLE === '1' || process.env.OPL_SHUFFLE === 'true'))
  const netTarget = resolveNetTarget(argv)
  if (netTarget) {
    engine.selectNetworkDevice(netTarget.host, netTarget.port)
  } else {
    const outs = midiOutputs()
    if (outs.length) engine.selectDevice(outs.find((n) => n.toLowerCase().includes('opl3')) || outs[0]!)
  }
  if (files.length) engine.load(0)

  const dbPath = process.env.OPL_LIBRARY_DB || join(MIDI_TOOL_DIR, '.opl-library.json')
  engine.uploadsDir = process.env.OPL_UPLOADS_DIR || join(dirname(dbPath), '.opl-uploads')
  try {
    engine.library = await openLibrary(dbPath)
  } catch (e) {
    console.error('library disabled:', (e as Error).message)
  }

  // v2 (the React SPA) is now the default; `--ui classic` opts back to the
  // legacy page. ensureWebUi falls back to classic if the SPA can't be built.
  const ui = (argv.ui || process.env.OPL_UI || 'v2').toLowerCase()
  const useSpa = ensureWebUi(ui !== 'classic')
  createServer(engine, argv.http, { useSpa })
  console.log(`opl web player:  http://localhost:${argv.http}  (UI: ${useSpa ? 'v2' : 'classic'})`)
  console.log(`folder: ${folder}  (${files.length} tracks)   device: ${engine.deviceName || 'none'}`)
  console.log('Ctrl-C to stop.')

  const serveCleanup = () => {
    if (engine.out) resetToBaseline(engine.out)
    engine.allNotesOff()
  }
  process.on('SIGINT', () => {
    serveCleanup()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    serveCleanup()
    process.exit(0)
  })
  process.on('uncaughtException', (err) => {
    console.error('\ncrashed:', err.message || err)
    serveCleanup()
    process.exit(1)
  })
  process.on('unhandledRejection', (err) => {
    console.error('\ncrashed (unhandled rejection):', (err as Error)?.message || err)
    serveCleanup()
    process.exit(1)
  })
}
