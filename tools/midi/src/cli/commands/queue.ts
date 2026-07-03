import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

import { openQueue } from '../../adapters/storage/queue.ts'
import { MIDI_TOOL_DIR } from '../../adapters/fs/paths.ts'
import { extractRenderArgs, serializeRenderArgs } from '../renderOptions.ts'
import { sleep, type GlobalArgv } from '../shared.ts'

// `opl queue run` spawns a fresh `opl render` child per job (rather than
// calling cmdRender in-process) so each job gets its own process boundary and
// cmdRender's internal process.exit() calls just end that job, not the runner.

function queueDbPath(): string {
  return process.env.OPL_QUEUE_DB || join(MIDI_TOOL_DIR, '.opl-queue.json')
}

// The bin entry — spawning this (not import.meta.url, which would point at
// this module) keeps child renders going through the same CLI wiring.
function oplEntry(): string {
  return join(MIDI_TOOL_DIR, 'opl.mjs')
}

export interface QueueAddArgv extends GlobalArgv {
  paths?: string[]
}

export async function cmdQueueAdd(argv: QueueAddArgv & Record<string, unknown>): Promise<void> {
  const paths = argv.paths || []
  if (paths.length === 0) {
    console.error('No files specified. Usage: opl queue add <file.mid | folder> [render options]')
    process.exit(1)
  }
  const queue = await openQueue(queueDbPath())
  const job = await queue.add({ paths, args: extractRenderArgs(argv) })
  console.log(`Queued #${job.id}: ${job.label}`)
}

export async function cmdQueueList(): Promise<void> {
  const queue = await openQueue(queueDbPath())
  const jobs = queue.list()
  if (jobs.length === 0) {
    console.log('Queue is empty.')
    return
  }
  for (const job of jobs) {
    const flags = serializeRenderArgs(job.args).join(' ')
    console.log(`  #${job.id} [${job.status}] ${job.label}${flags ? '  ' + flags : ''}`)
  }
}

export async function cmdQueueRemove(argv: { id: number }): Promise<void> {
  const queue = await openQueue(queueDbPath())
  const removed = await queue.remove(argv.id)
  console.log(removed ? `Removed #${argv.id}.` : `No job #${argv.id} found.`)
}

export async function cmdQueueClear(): Promise<void> {
  const queue = await openQueue(queueDbPath())
  const count = await queue.clear()
  console.log(count ? `Cleared ${count} job(s).` : 'Queue is already empty.')
}

// Sends SIGTERM to the process that owns `opl queue run` (tracked via its PID in the
// queue file), if one is currently running. That process's own SIGTERM handler is
// responsible for stopping its active child render cleanly (chip reset, OBS stop).
export async function cmdQueueStop(): Promise<void> {
  const queue = await openQueue(queueDbPath())
  const pid = queue.runnerPid()
  if (!pid) {
    console.log('No queue runner is currently running.')
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
    console.log(`Sent stop signal to queue runner (pid ${pid}).`)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    console.log(`Queue runner (pid ${pid}) is not running (${err.code === 'ESRCH' ? 'already exited' : err.message}).`)
    await queue.setRunnerPid(null)
  }
}

export async function cmdQueueRun(argv: { watch: boolean }): Promise<void> {
  const queue = await openQueue(queueDbPath())
  const scriptPath = oplEntry()
  console.log(`Queue runner started${argv.watch ? ' (--watch)' : ''}.`)
  await queue.setRunnerPid(process.pid)

  let activeChild: ChildProcess | null = null
  let stopping = false
  const onStop = (signal: 'SIGINT' | 'SIGTERM') => {
    if (stopping) return
    stopping = true
    console.log(
      `\nQueue runner received ${signal}, stopping${activeChild ? ' (waiting for the active render to clean up)' : ''}...`,
    )
    if (activeChild)
      activeChild.kill(signal) // its own SIGINT/SIGTERM handler resets the chip + stops OBS
    else process.exit(0)
  }
  process.on('SIGINT', () => onStop('SIGINT'))
  process.on('SIGTERM', () => onStop('SIGTERM'))

  while (!stopping) {
    await queue.refresh() // pick up jobs added by a separate `opl queue add` process
    const job = queue.nextPending()
    if (!job) {
      if (!argv.watch) break
      await sleep(5000)
      continue
    }

    console.log(`\n[#${job.id}] rendering: ${job.label}`)
    await queue.setStatus(job.id, 'running', { startedAt: new Date().toISOString() })
    const flags = serializeRenderArgs(job.args)
    const code = await new Promise<number | null>((resolveExit) => {
      const child = spawn(process.execPath, [scriptPath, 'render', ...job.paths, ...flags], { stdio: 'inherit' })
      activeChild = child
      child.on('close', (c) => resolveExit(c))
      child.on('error', () => resolveExit(-1))
    })
    activeChild = null

    if (stopping) {
      await queue.setStatus(job.id, 'failed', { finishedAt: new Date().toISOString(), error: 'stopped by user' })
      console.log(`[#${job.id}] stopped: ${job.label}`)
      break
    } else if (code === 0) {
      await queue.setStatus(job.id, 'done', { finishedAt: new Date().toISOString() })
      console.log(`[#${job.id}] done: ${job.label}`)
    } else {
      await queue.setStatus(job.id, 'failed', { finishedAt: new Date().toISOString(), error: `exit code ${code}` })
      console.error(`[#${job.id}] FAILED (exit ${code}): ${job.label}`)
    }
  }
  await queue.setRunnerPid(null)
  console.log(stopping ? 'Queue runner stopped.' : 'Queue empty. Exiting.')
  process.exit(0)
}
