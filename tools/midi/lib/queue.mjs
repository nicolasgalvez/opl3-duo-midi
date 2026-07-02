import { JSONFilePreset } from 'lowdb/node'
import { basename } from 'node:path'

// A small, persistent render job queue, backed by a lowdb JSON file (same
// pattern as the media library in lib/library.mjs) so `opl queue run` can be
// restarted, and `opl queue add`/`opl queue run --watch` can run as separate
// processes against the same queue file.

export async function openQueue(dbPath) {
  const db = await JSONFilePreset(dbPath, { jobs: [], seq: 0 })
  return new RenderQueue(db)
}

export class RenderQueue {
  constructor(db) {
    this.db = db
  }

  /** Add a pending job. `paths` are opl-render positional args; `args` are extractRenderArgs() output. */
  async add({ paths, args = {}, label }) {
    const job = {
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

  list() {
    return this.db.data.jobs.slice()
  }

  /** Re-read the queue file from disk, picking up jobs added by another process (e.g. `opl queue add` while `run --watch` is active). */
  async refresh() {
    await this.db.read()
  }

  async remove(id) {
    const before = this.db.data.jobs.length
    this.db.data.jobs = this.db.data.jobs.filter((j) => j.id !== id)
    const removed = this.db.data.jobs.length < before
    if (removed) await this.db.write()
    return removed
  }

  /** The oldest job still awaiting a render, or null if none. */
  nextPending() {
    return this.db.data.jobs.find((j) => j.status === 'pending') ?? null
  }

  async setStatus(id, status, extra = {}) {
    const job = this.db.data.jobs.find((j) => j.id === id)
    if (!job) return null
    Object.assign(job, { status, ...extra })
    await this.db.write()
    return job
  }
}
