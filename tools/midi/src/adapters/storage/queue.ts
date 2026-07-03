import { JSONFilePreset } from 'lowdb/node'
import type { Low } from 'lowdb'
import { basename } from 'node:path'

import type { RenderArgs } from '../../contracts/render.ts'
import type { RenderJob, RenderJobStatus } from '../../contracts/queue.ts'

// A small, persistent render job queue, backed by a lowdb JSON file (same
// pattern as the media library in adapters/storage/library.ts) so `opl queue
// run` can be restarted, and `opl queue add`/`opl queue run --watch` can run
// as separate processes against the same queue file.

interface QueueData {
  jobs: RenderJob[]
  seq: number
  runnerPid: number | null
}

export async function openQueue(dbPath: string): Promise<RenderQueue> {
  const db = await JSONFilePreset<QueueData>(dbPath, { jobs: [], seq: 0, runnerPid: null })
  return new RenderQueue(db)
}

export class RenderQueue {
  readonly db: Low<QueueData>

  constructor(db: Low<QueueData>) {
    this.db = db
  }

  /** Add a pending job. `paths` are opl-render positional args; `args` are extractRenderArgs() output. */
  async add({ paths, args = {}, label }: { paths: string[]; args?: RenderArgs; label?: string }): Promise<RenderJob> {
    const job: RenderJob = {
      id: ++this.db.data.seq,
      paths,
      args,
      label: label ?? paths.map((p) => basename(p)).join(', '),
      status: 'pending',
      addedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      error: null,
    }
    this.db.data.jobs.push(job)
    await this.db.write()
    return job
  }

  list(): RenderJob[] {
    return this.db.data.jobs.slice()
  }

  /** Re-read the queue file from disk, picking up jobs added by another process (e.g. `opl queue add` while `run --watch` is active). */
  async refresh(): Promise<void> {
    await this.db.read()
  }

  async remove(id: number): Promise<boolean> {
    const before = this.db.data.jobs.length
    this.db.data.jobs = this.db.data.jobs.filter((j) => j.id !== id)
    const removed = this.db.data.jobs.length < before
    if (removed) await this.db.write()
    return removed
  }

  /** Drop every job regardless of status. Returns how many were removed. */
  async clear(): Promise<number> {
    const count = this.db.data.jobs.length
    if (count) {
      this.db.data.jobs = []
      await this.db.write()
    }
    return count
  }

  /** PID of the `opl queue run` process currently holding this queue, or null. */
  runnerPid(): number | null {
    return this.db.data.runnerPid ?? null
  }

  async setRunnerPid(pid: number | null): Promise<void> {
    this.db.data.runnerPid = pid
    await this.db.write()
  }

  /** The oldest job still awaiting a render, or null if none. */
  nextPending(): RenderJob | null {
    return this.db.data.jobs.find((j) => j.status === 'pending') ?? null
  }

  async setStatus(id: number, status: RenderJobStatus, extra: Partial<RenderJob> = {}): Promise<RenderJob | null> {
    const job = this.db.data.jobs.find((j) => j.id === id)
    if (!job) return null
    Object.assign(job, { status, ...extra })
    await this.db.write()
    return job
  }
}
