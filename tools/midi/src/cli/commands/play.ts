import { basename } from 'node:path'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'

import { buildMidiEvents, buildVgmEvents, type TimedActionList } from '../../core/events.ts'
import { resetToBaseline } from '../../core/engine.ts'
import { buildControllerResetMessages, sendMessages } from '../../core/midiReset.ts'
import { collectFiles, loadTrack } from '../../adapters/fs/tracks.ts'
import type { MidiOutput, ClosableMidiOutput } from '../../ports/midiOutput.ts'
import { openOutput, allNotesOff, type GlobalArgv } from '../shared.ts'

export interface PlayArgv extends GlobalArgv {
  paths: string[]
  recursive: boolean
  shuffle: boolean
  loop: boolean
  ch?: number
}

interface PlayKeys extends EventEmitter {
  close(): void
}

function buildEvents(out: MidiOutput, path: string, forceCh?: number | null): TimedActionList {
  const track = loadTrack(path)
  return track.format === 'vgm' ? buildVgmEvents(out, track.vgm) : buildMidiEvents(out, track.midi, forceCh)
}

function makeKeys(): PlayKeys | null {
  if (!process.stdin.isTTY) return null
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  const em = new EventEmitter() as PlayKeys
  const handler = (str: string, key: { ctrl?: boolean; name?: string } | undefined) => {
    if (key && key.ctrl && key.name === 'c') {
      em.emit('key', 'q')
      return
    }
    em.emit('key', str)
  }
  process.stdin.on('keypress', handler)
  em.close = () => {
    process.stdin.off('keypress', handler)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.pause()
  }
  return em
}

type PlayAction = 'next' | 'prev' | 'quit' | 'done'

// Returns 'next' | 'prev' | 'quit' | 'done'.
function playOne(
  out: ClosableMidiOutput,
  path: string,
  forceCh: number | undefined,
  keys: PlayKeys | null,
): Promise<PlayAction> {
  resetToBaseline(out) // clean chip state before this track, regardless of what the previous one left behind
  let info: TimedActionList
  try {
    info = buildEvents(out, path, forceCh)
  } catch (e) {
    console.error(`   ! skip (${(e as Error).message})`)
    return Promise.resolve('next')
  }

  process.stdout.write(`▶  ${basename(path)}  (~${info.duration.toFixed(0)}s)\n`)
  return new Promise((resolve) => {
    const { events } = info
    let idx = 0
    let start = performance.now()
    let paused = false
    let pauseAt = 0

    const finish = (action: PlayAction) => {
      clearInterval(timer)
      if (keys) keys.off('key', onKey)
      resolve(action)
    }
    const onKey = (k: string) => {
      if (k === 'n') finish('next')
      else if (k === 'p') finish('prev')
      else if (k === 'q') finish('quit')
      else if (k === ' ') {
        if (!paused) {
          paused = true
          pauseAt = performance.now()
          sendMessages(out, buildControllerResetMessages())
          process.stdout.write('   ⏸  paused\n')
        } else {
          paused = false
          start += performance.now() - pauseAt
          process.stdout.write('   ▶  resumed\n')
        }
      }
    }
    if (keys) keys.on('key', onKey)

    const timer = setInterval(() => {
      if (paused) return
      const elapsed = (performance.now() - start) / 1000
      while (idx < events.length && events[idx]!.t <= elapsed) {
        try {
          events[idx]!.fn()
        } catch {
          /* ignore a bad event */
        }
        idx++
      }
      if (idx >= events.length) finish('done')
    }, 4)
  })
}

export async function cmdPlay(argv: PlayArgv): Promise<void> {
  const files = collectFiles(argv.paths, argv.recursive)
  if (files.length === 0) {
    console.error('No playable files found.')
    process.exit(1)
  }
  if (argv.shuffle) files.sort(() => Math.random() - 0.5)

  const { out, name } = openOutput(argv)
  await out.ready?.() // let UDP resolve ARP before the t=0 program-change burst
  const keys = makeKeys()
  console.log(
    `${name}: ${files.length} track(s).` +
      (keys ? '  controls: n=next p=prev space=pause q=quit' : '  (non-interactive)'),
  )

  const cleanup = () => {
    resetToBaseline(out)
    allNotesOff(out)
    if (keys) keys.close()
    out.close()
  }
  process.on('SIGINT', () => {
    console.log('\nstopped.')
    cleanup()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(0)
  })
  process.on('uncaughtException', (err) => {
    console.error('\ncrashed:', err.message || err)
    cleanup()
    process.exit(1)
  })
  process.on('unhandledRejection', (err) => {
    console.error('\ncrashed (unhandled rejection):', (err as Error)?.message || err)
    cleanup()
    process.exit(1)
  })

  let i = 0
  while (i >= 0 && i < files.length) {
    process.stdout.write(`[${i + 1}/${files.length}] `)
    const action = await playOne(out, files[i]!, argv.ch, keys)
    sendMessages(out, buildControllerResetMessages()) // full reset between tracks — mirrors Engine.load()
    if (action === 'quit') break
    i = action === 'prev' ? Math.max(0, i - 1) : i + 1
    if (i >= files.length && argv.loop) i = 0
  }
  cleanup()
}
