import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { openQueue } from '../src/adapters/storage/queue.ts'

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'opl-queue-'))
  return { dir, file: join(dir, 'queue.json') }
}

test('add stores a pending job with a derived label', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    const job = await q.add({ paths: ['Loom (1990)'], args: { album: true, obs: true } })
    assert.equal(job.status, 'pending')
    assert.equal(job.label, 'Loom (1990)')
    assert.deepEqual(job.args, { album: true, obs: true })
    assert.equal(job.id, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('add assigns increasing ids and an explicit label wins over the derived one', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    const a = await q.add({ paths: ['a.mid'] })
    const b = await q.add({ paths: ['b.mid'], label: 'Custom Label' })
    assert.equal(a.id, 1)
    assert.equal(b.id, 2)
    assert.equal(b.label, 'Custom Label')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('list returns all jobs in insertion order', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    await q.add({ paths: ['a.mid'] })
    await q.add({ paths: ['b.mid'] })
    assert.deepEqual(
      q.list().map((j) => j.paths[0]),
      ['a.mid', 'b.mid'],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('remove drops a job by id and reports whether it removed anything', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    const job = await q.add({ paths: ['a.mid'] })
    assert.equal(await q.remove(job.id), true)
    assert.equal(q.list().length, 0)
    assert.equal(await q.remove(job.id), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('nextPending returns the oldest pending job, or null when none', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    assert.equal(q.nextPending(), null)
    const a = await q.add({ paths: ['a.mid'] })
    await q.add({ paths: ['b.mid'] })
    assert.equal(q.nextPending()!.id, a.id)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('setStatus updates a job in place and persists it', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    const job = await q.add({ paths: ['a.mid'] })
    await q.setStatus(job.id, 'running', { startedAt: '2026-01-01T00:00:00.000Z' })
    assert.equal(q.list()[0]!.status, 'running')
    assert.equal(q.list()[0]!.startedAt, '2026-01-01T00:00:00.000Z')

    // Persistence: reopen from the same file and confirm the update survived.
    const reopened = await openQueue(file)
    assert.equal(reopened.list()[0]!.status, 'running')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refresh picks up a job added by a separate queue instance on the same file', async () => {
  const { dir, file } = tmpDb()
  try {
    const reader = await openQueue(file)
    assert.equal(reader.nextPending(), null)

    const writer = await openQueue(file)
    await writer.add({ paths: ['a.mid'] })

    // `reader` hasn't refreshed yet -- still stale.
    assert.equal(reader.nextPending(), null)
    await reader.refresh()
    assert.ok(reader.nextPending())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('nextPending skips running/done/failed jobs', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    const a = await q.add({ paths: ['a.mid'] })
    const b = await q.add({ paths: ['b.mid'] })
    await q.setStatus(a.id, 'done')
    assert.equal(q.nextPending()!.id, b.id)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('clear removes every job regardless of status and reports how many', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    const a = await q.add({ paths: ['a.mid'] })
    await q.add({ paths: ['b.mid'] })
    await q.setStatus(a.id, 'failed')
    assert.equal(await q.clear(), 2)
    assert.deepEqual(q.list(), [])
    assert.equal(await q.clear(), 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runner PID: unset by default, persists across reopen, clears back to null', async () => {
  const { dir, file } = tmpDb()
  try {
    const q = await openQueue(file)
    assert.equal(q.runnerPid(), null)

    await q.setRunnerPid(4242)
    assert.equal(q.runnerPid(), 4242)

    const reopened = await openQueue(file)
    assert.equal(reopened.runnerPid(), 4242)

    await q.setRunnerPid(null)
    assert.equal(q.runnerPid(), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
