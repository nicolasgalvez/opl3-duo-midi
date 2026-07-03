import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import type { AddressInfo } from 'node:net'
import type { BrowserType } from 'playwright'

import { Engine, resetToBaseline } from '../../core/engine.ts'
import { resolveNetTarget } from '../../core/deviceTarget.ts'
import { resolveLayout } from '../../core/layout.ts'
import { resolveDimensions, type Dimensions } from '../../core/presets.ts'
import { buildMuxArgs, resolveAvOffset } from '../../core/mux.ts'
import type { NetTarget } from '../../contracts/net.ts'
import { collectFiles, trackDuration } from '../../adapters/fs/tracks.ts'
import { resolveLib } from '../../adapters/fs/paths.ts'
import { midiOutputs } from '../../adapters/midi/outputs.ts'
import { startAudioCapture, listAudioDevices } from '../../adapters/audio/capture.ts'
import { createServer } from '../../adapters/http/server.ts'
import {
  connectObs,
  resolveObsOpts,
  setBrowserSourceUrl,
  startObsRecording,
  stopObsRecording,
  waitForFile,
  waitForObsRecording,
  type ObsOpts,
} from '../../adapters/obs.ts'
import { createEngine } from '../wiring.ts'
import { sleep, type GlobalArgv } from '../shared.ts'
import type http from 'node:http'

// The headless renderer drives the visualizer page; these run inside the
// browser via page.waitForFunction, so give TS just enough DOM to typecheck.
declare const document: {
  getElementById(id: string): { textContent: string | null } | null
}

export interface RenderArgv extends GlobalArgv {
  paths?: string[]
  recursive: boolean
  album: boolean
  audioDevice?: string
  audioChannels?: string
  audioRate?: number
  output?: string
  ratio: string
  platform?: string
  aspect?: string
  resolution?: string
  art?: string
  tail: number
  device?: string
  fps: number
  keepTemps: boolean
  listAudio: boolean
  theme?: string
  title?: string
  layout?: string
  obs: boolean
  obsUrl?: string
  obsPassword?: string
  obsSource?: string
  avOffset?: number
  browserPath?: string
}

interface ResolvedRenderOpts {
  dims: Dimensions
  audioDevice: string
  audioChannels: string | null
  audioRate: number
  devName: string | null
  netTarget: NetTarget | null
  chromium: BrowserType | null
  browserPath: string | null
  obsOpts: ObsOpts | null
}

interface RenderSessionArgs {
  playlist: string[]
  singleMode: boolean
  totalDuration: number
  outPath: string
  label: string
  argv: RenderArgv
  opts: ResolvedRenderOpts
}

// Set by renderSessionObs/renderSession while a track is actively rendering, so a
// SIGINT/SIGTERM (Ctrl-C, or `opl queue stop` forwarding its signal to this child)
// can silence the chip and stop OBS instead of just killing the process mid-recording.
let activeRenderCleanup: (() => Promise<void> | void) | null = null

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const port = (srv.address() as AddressInfo).port
      srv.close(() => resolve(port))
    })
  })
}

// Resolve shared render options once (used across all render modes)
async function resolveRenderOpts(argv: RenderArgv): Promise<ResolvedRenderOpts> {
  let dims: Dimensions
  try {
    dims = resolveDimensions(argv)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }

  const audioDevice = argv.audioDevice || process.env.OPL_AUDIO_DEVICE
  if (!audioDevice) {
    console.error('No audio device specified. Use --audio-device, set OPL_AUDIO_DEVICE in .env, or try --list-audio.')
    process.exit(1)
  }
  const audioChannels = argv.audioChannels || process.env.OPL_AUDIO_CHANNELS || null
  const audioRate = Number(argv.audioRate || process.env.OPL_AUDIO_RATE || 48000)

  const netTarget = resolveNetTarget(argv)
  let devName: string | null = null
  if (!netTarget) {
    const outs = midiOutputs()
    if (outs.length === 0) {
      console.error('No MIDI output ports found. Use --host to target a network MIDI device instead.')
      process.exit(1)
    }
    const midiMatch = argv.device || process.env.OPL_MIDI_DEVICE
    devName =
      (midiMatch
        ? outs.find((n) => n === midiMatch) || outs.find((n) => n.toLowerCase().includes(midiMatch.toLowerCase()))
        : outs.find((n) => n.toLowerCase().includes('opl3')) || outs[0]) ?? null
  }

  let chromium: BrowserType | null = null
  const browserPath = argv.browserPath || process.env.OPL_BROWSER_PATH || null
  if (!argv.obs) {
    try {
      const pw = await import('playwright')
      chromium = pw.chromium
    } catch {
      console.error('Playwright is required for `opl render`. Install it:')
      console.error('  npm install && npx playwright install chromium')
      process.exit(1)
    }
  }

  const obsOpts = argv.obs ? resolveObsOpts(argv) : null

  return { dims, audioDevice, audioChannels, audioRate, devName, netTarget, chromium, browserPath, obsOpts }
}

function createRenderCleanup(engine: Engine, server: http.Server): () => void {
  let cleaned = false
  return () => {
    if (cleaned) return
    cleaned = true
    try {
      clearInterval(engine.timer)
    } catch {
      /* ignore */
    }
    try {
      if (engine.out) resetToBaseline(engine.out)
      engine.allNotesOff()
    } catch {
      /* ignore */
    }
    try {
      if (engine.out) {
        engine.out.close()
        engine.out = null
      }
    } catch {
      /* ignore */
    }
    try {
      server.close()
    } catch {
      /* ignore */
    }
  }
}

interface SetupRenderEngineArgs {
  playlist: string[]
  singleMode: boolean
  argv: RenderArgv
  devName: string | null
  netTarget: NetTarget | null
  port?: number
}

async function setupRenderEngine({ playlist, singleMode, argv, devName, netTarget, port }: SetupRenderEngineArgs) {
  const engine = createEngine()
  engine.single = singleMode
  engine.repeat = false
  engine.shuffle = false
  engine.theme = argv.theme || process.env.OPL_THEME || 'green'
  engine.title = argv.title || process.env.OPL_TITLE || engine.title
  const layoutArgv: { layout?: string } = { ...argv }
  if (argv.obs && !argv.layout && !process.env.OPL_LAYOUT) layoutArgv.layout = 'overlay'
  try {
    engine.layout = resolveLayout(layoutArgv)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
  engine.setPlaylist(playlist)
  if (argv.art) {
    if (argv.art.startsWith('http')) {
      console.error('URL-based art is not yet supported. Use a local file path for --art.')
      process.exit(1)
    }
    try {
      statSync(argv.art)
      engine.artPath = argv.art
    } catch {
      console.error(`Art file not found: ${argv.art}`)
      process.exit(1)
    }
  }
  if (netTarget) engine.selectNetworkDevice(netTarget.host, netTarget.port)
  else if (devName) engine.selectDevice(devName)
  engine.load(0)

  const httpPort = port ?? (argv.port ? Number(argv.port) : await getFreePort())
  const server = createServer(engine, httpPort)
  return { engine, server, httpPort }
}

async function muxVideoAudio({
  videoFile,
  audioFile,
  outPath,
  fps,
  avOffsetMs = 0,
}: {
  videoFile: string
  audioFile: string
  outPath: string
  fps: number
  avOffsetMs?: number
}): Promise<void> {
  const muxArgs = buildMuxArgs({ videoFile, audioFile, outPath, fps, avOffsetMs })
  await new Promise<void>((resolve, reject) => {
    spawn('ffmpeg', muxArgs, { stdio: ['ignore', 'inherit', 'inherit'] }).on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

// One full render pipeline: engine + server + OBS recording + ffmpeg audio + mux.
async function renderSessionObs({
  playlist,
  singleMode,
  totalDuration,
  outPath,
  label,
  argv,
  opts,
}: RenderSessionArgs): Promise<string> {
  const { dims, audioDevice, audioChannels, audioRate, devName, netTarget } = opts
  const obsOpts = opts.obsOpts!
  const midiLabel = netTarget ? `net://${netTarget.host}:${netTarget.port}` : devName

  const { engine, server, httpPort } = await setupRenderEngine({ playlist, singleMode, argv, devName, netTarget })
  const cleanup = createRenderCleanup(engine, server)
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'opl-render-'))
  const audioFile = join(tmpDir, 'audio.wav')
  const pageUrl = `http://localhost:${httpPort}/render.html`

  let obsConn
  try {
    obsConn = await connectObs(obsOpts)
  } catch (e) {
    console.error((e as Error).message)
    cleanup()
    process.exit(1)
  }
  const { obs, info } = obsConn

  console.log(`\nRendering (OBS): ${label}  (${totalDuration.toFixed(1)}s)`)
  console.log(
    `Resolution: ${dims.w}x${dims.h}  Audio: ${audioDevice}${audioChannels ? ` ch${audioChannels}` : ''} @ ${audioRate}Hz  MIDI: ${midiLabel}`,
  )
  console.log(`OBS: ${info.obsWebSocketVersion || 'connected'} @ ${obsOpts.url}`)
  console.log(`Visualizer: ${pageUrl}`)

  if (obsOpts.source) {
    try {
      await setBrowserSourceUrl(obs, obsOpts.source, pageUrl, dims.w, dims.h)
      console.log(`Browser source "${obsOpts.source}" pointed at visualizer.`)
    } catch (e) {
      console.error(`Could not update browser source "${obsOpts.source}": ${(e as Error).message}`)
      cleanup()
      try {
        await obs.disconnect()
      } catch {
        /* ignore */
      }
      process.exit(1)
    }
  } else {
    console.log('Tip: pass --obs-source "Your Browser Source Name" to auto-set the URL.')
  }

  // Give the browser source time to load the page and receive SSE state.
  await sleep(obsOpts.source ? 2000 : 1500)

  const recDur = totalDuration + 0.5
  let cap
  try {
    cap = startAudioCapture({ device: audioDevice, channels: audioChannels, rate: audioRate, outFile: audioFile })
  } catch (e) {
    console.error((e as Error).message)
    cleanup()
    try {
      await obs.disconnect()
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  activeRenderCleanup = async () => {
    try {
      cap.stop()
    } catch {
      /* ignore */
    }
    try {
      engine.stop()
      if (engine.out) resetToBaseline(engine.out)
    } catch {
      /* ignore */
    }
    try {
      await stopObsRecording(obs)
    } catch {
      /* ignore — may not have started recording yet */
    }
    try {
      await obs.disconnect()
    } catch {
      /* ignore */
    }
    cleanup()
  }

  try {
    await startObsRecording(obs)
    await waitForObsRecording(obs)
  } catch (e) {
    console.error((e as Error).message)
    cap.stop()
    cleanup()
    try {
      await obs.disconnect()
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  await sleep(300)
  engine.play()
  await sleep(recDur * 1000)
  engine.stop()
  const frames = cap.stop()
  console.log(`Capture complete (${(frames / audioRate).toFixed(1)}s audio). Stopping OBS...`)

  let videoFile: string
  try {
    videoFile = await stopObsRecording(obs)
    await waitForFile(videoFile)
  } catch (e) {
    console.error((e as Error).message)
    cleanup()
    try {
      await obs.disconnect()
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  try {
    await obs.disconnect()
  } catch {
    /* ignore */
  }

  try {
    statSync(audioFile)
  } catch {
    console.error('Audio recording failed: no audio file written.')
    cleanup()
    process.exit(1)
  }

  console.log(`OBS video: ${videoFile}`)
  const avOffsetMs = resolveAvOffset(argv)
  if (avOffsetMs) {
    const hint = avOffsetMs > 0 ? 'audio delayed relative to video' : 'video delayed relative to audio'
    console.log(`A/V offset: ${avOffsetMs > 0 ? '+' : ''}${avOffsetMs}ms (${hint})`)
  }
  console.log('Encoding final video...')
  try {
    await muxVideoAudio({ videoFile, audioFile, outPath, fps: argv.fps, avOffsetMs })
  } catch (e) {
    console.error((e as Error).message)
    cleanup()
    process.exit(1)
  }

  activeRenderCleanup = null
  cleanup()
  if (!argv.keepTemps) {
    try {
      rmSync(tmpDir, { recursive: true })
    } catch {
      /* ignore */
    }
  } else {
    console.log(`Temp files: ${tmpDir}`)
  }

  console.log(`Done: ${outPath}`)
  return outPath
}

// One full render pipeline: engine + server + headless browser + ffmpeg audio + mux.
async function renderSession(args: RenderSessionArgs): Promise<string> {
  const { playlist, singleMode, totalDuration, outPath, label, argv, opts } = args
  if (argv.obs) {
    return renderSessionObs(args)
  }

  const { dims, audioDevice, audioChannels, audioRate, devName, netTarget, chromium, browserPath } = opts
  const midiLabel = netTarget ? `net://${netTarget.host}:${netTarget.port}` : devName

  const { engine, server, httpPort } = await setupRenderEngine({ playlist, singleMode, argv, devName, netTarget })
  const cleanup = createRenderCleanup(engine, server)
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'opl-render-'))
  const audioFile = join(tmpDir, 'audio.wav')

  console.log(`\nRendering: ${label}  (${totalDuration.toFixed(1)}s)`)
  console.log(
    `Resolution: ${dims.w}x${dims.h}  Audio: ${audioDevice}${audioChannels ? ` ch${audioChannels}` : ''} @ ${audioRate}Hz  MIDI: ${midiLabel}`,
  )

  let browser
  try {
    browser = await chromium!.launch({ headless: true, executablePath: browserPath || undefined })
  } catch (e) {
    console.error(
      `Failed to launch ${browserPath ? `browser at ${browserPath}` : "Playwright's bundled browser"}: ${(e as Error).message}`,
    )
    if (!browserPath) {
      console.error(
        "If this is an older OS (e.g. macOS < 14), Playwright's downloaded browser may not run here.\n" +
          'Point at an installed Chrome/Chromium instead with --browser-path (or OPL_BROWSER_PATH), e.g.:\n' +
          '  --browser-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"\n' +
          'Or capture via a live OBS session instead: --obs',
      )
    }
    process.exit(1)
  }
  const context = await browser.newContext({
    viewport: { width: dims.w, height: dims.h },
    recordVideo: { dir: tmpDir, size: { width: dims.w, height: dims.h } },
  })
  const page = await context.newPage()

  await page.goto(`http://localhost:${httpPort}/render.html`, { waitUntil: 'domcontentloaded' })
  await page
    .waitForFunction(
      () => {
        const el = document.getElementById('track-name')
        return el && el.textContent && el.textContent.trim().length > 0 && el.textContent.trim() !== '—'
      },
      { timeout: 5000 },
    )
    .catch(() => {})

  // Start audio recording via audify (RtAudio -> CoreAudio).
  const recDur = totalDuration + 0.5
  let cap
  try {
    cap = startAudioCapture({ device: audioDevice, channels: audioChannels, rate: audioRate, outFile: audioFile })
  } catch (e) {
    console.error((e as Error).message)
    cleanup()
    process.exit(1)
  }

  await sleep(300)
  engine.play()

  await sleep(recDur * 1000)
  engine.stop()
  const frames = cap.stop()
  console.log(`Capture complete (${(frames / audioRate).toFixed(1)}s audio). Finalizing...`)

  await context.close()
  await browser.close()

  const webmFiles = readdirSync(tmpDir).filter((f) => f.endsWith('.webm'))
  if (webmFiles.length === 0) {
    console.error('No video file created.')
    cleanup()
    process.exit(1)
  }
  const videoFile = join(tmpDir, webmFiles[0]!)

  try {
    statSync(audioFile)
  } catch {
    console.error('Audio recording failed: no audio file written.')
    cleanup()
    process.exit(1)
  }

  console.log('Encoding final video...')
  const avOffsetMs = resolveAvOffset(argv)
  if (avOffsetMs) {
    const hint = avOffsetMs > 0 ? 'audio delayed relative to video' : 'video delayed relative to audio'
    console.log(`A/V offset: ${avOffsetMs > 0 ? '+' : ''}${avOffsetMs}ms (${hint})`)
  }
  try {
    await muxVideoAudio({ videoFile, audioFile, outPath, fps: argv.fps, avOffsetMs })
  } catch (e) {
    console.error((e as Error).message)
    cleanup()
    process.exit(1)
  }

  cleanup()
  if (!argv.keepTemps) {
    try {
      rmSync(tmpDir, { recursive: true })
    } catch {
      /* ignore */
    }
  } else {
    console.log(`Temp files: ${tmpDir}`)
  }

  console.log(`Done: ${outPath}`)
  return outPath
}

export async function cmdRender(argv: RenderArgv): Promise<void> {
  if (argv.listAudio) {
    await listAudioDevices()
    return
  }

  // Ctrl-C, or a SIGTERM forwarded by `opl queue stop`: silence the chip and stop
  // OBS/audio capture for whichever track is currently rendering, instead of just
  // killing the process mid-recording and leaving hardware/OBS in a stuck state.
  const onInterrupt = (signal: 'SIGINT' | 'SIGTERM') => async () => {
    console.log(`\n${signal} received, stopping render...`)
    if (activeRenderCleanup) {
      try {
        await activeRenderCleanup()
      } catch {
        /* best-effort */
      }
    }
    process.exit(signal === 'SIGINT' ? 0 : 1)
  }
  process.on('SIGINT', onInterrupt('SIGINT'))
  process.on('SIGTERM', onInterrupt('SIGTERM'))

  // Resolve paths (file(s) or folder(s))
  const paths = argv.paths || []
  if (paths.length === 0) {
    console.error('No files specified. Usage: opl render <file.mid | folder> [options]')
    process.exit(1)
  }
  const files = collectFiles(paths.map(resolveLib), argv.recursive)
  if (files.length === 0) {
    console.error('No playable files found.')
    process.exit(1)
  }

  const opts = await resolveRenderOpts(argv)
  const tag =
    argv.resolution || (argv.platform && argv.aspect) ? `${opts.dims.w}x${opts.dims.h}` : argv.ratio.replace(':', 'x')

  // --- Album mode: all tracks as one continuous video ---
  if (argv.album && files.length > 1) {
    let totalDuration = argv.tail
    for (const f of files) {
      totalDuration += trackDuration(f)
    }
    console.log(`Album: ${files.length} tracks, ${totalDuration.toFixed(1)}s total`)
    const outPath = argv.output || join(process.cwd(), `album.${tag}.mp4`)
    await renderSession({
      playlist: files,
      singleMode: false,
      totalDuration,
      outPath,
      label: `${files.length} tracks (album)`,
      argv,
      opts,
    })
    process.exit(0)
  }

  // --- Single file ---
  if (files.length === 1) {
    const file = files[0]!
    const totalDuration = trackDuration(file) + argv.tail
    const outPath = argv.output || join(process.cwd(), `${basename(file, extname(file))}.${tag}.mp4`)
    await renderSession({
      playlist: [file],
      singleMode: true,
      totalDuration,
      outPath,
      label: basename(file),
      argv,
      opts,
    })
    process.exit(0)
  }

  // --- Batch mode: one video per file ---
  console.log(`Batch: ${files.length} files`)
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!
    console.log(`\n[${i + 1}/${files.length}]`)
    try {
      const totalDuration = trackDuration(file) + argv.tail
      const outPath = join(process.cwd(), `${basename(file, extname(file))}.${tag}.mp4`)
      await renderSession({
        playlist: [file],
        singleMode: true,
        totalDuration,
        outPath,
        label: basename(file),
        argv,
        opts,
      })
    } catch (e) {
      console.error(`  Error: ${(e as Error).message}`)
    }
  }
  // audify's RtAudio holds a CoreAudio handle with no release API that keeps
  // the event loop alive; exit explicitly now that all renders are done.
  process.exit(0)
}
