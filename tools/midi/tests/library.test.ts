import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { openLibrary } from '../src/adapters/storage/library.ts'

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'opl-lib-'))
  return { dir, file: join(dir, 'library.json') }
}

test('add stores path + derived metadata and lists it', async () => {
  const { dir, file } = tmpDb()
  try {
    const lib = await openLibrary(file)
    const e = await lib.add('/music/Doom/E1M1.mid', { addedAt: 100 })
    assert.equal(e.path, '/music/Doom/E1M1.mid')
    assert.equal(e.name, 'E1M1.mid')
    assert.equal(e.folder, 'Doom')
    assert.equal(e.addedAt, 100)
    assert.deepEqual(
      lib.list().map((x) => x.path),
      ['/music/Doom/E1M1.mid'],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('re-adding the same canonical path does not duplicate', async () => {
  const { dir, file } = tmpDb()
  try {
    const lib = await openLibrary(file)
    await lib.add('/music/a.mid')
    await lib.add('/music/a.mid') // exact
    await lib.add(resolve('/music/./a.mid')) // canonicalises to the same path
    assert.equal(lib.list().length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('addMany returns one entry per unique path', async () => {
  const { dir, file } = tmpDb()
  try {
    const lib = await openLibrary(file)
    const added = await lib.addMany(['/m/a.mid', '/m/b.mid', '/m/a.mid'])
    assert.equal(added.length, 3) // returns an entry for each input (deduped to same row)
    assert.equal(lib.list().length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('list(q) filters by name or folder, case-insensitively', async () => {
  const { dir, file } = tmpDb()
  try {
    const lib = await openLibrary(file)
    await lib.add('/music/Doom/E1M1.mid')
    await lib.add('/music/Heretic/intro.mid')
    assert.deepEqual(
      lib.list('doom').map((e) => e.name),
      ['E1M1.mid'],
    )
    assert.deepEqual(
      lib.list('INTRO').map((e) => e.name),
      ['intro.mid'],
    )
    assert.equal(lib.list('nope').length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('remove deletes by id', async () => {
  const { dir, file } = tmpDb()
  try {
    const lib = await openLibrary(file)
    const e = await lib.add('/m/a.mid')
    assert.equal(await lib.remove(e.id), true)
    assert.equal(lib.list().length, 0)
    assert.equal(await lib.remove(e.id), false) // already gone
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('library persists across reopen (survives a restart)', async () => {
  const { dir, file } = tmpDb()
  try {
    const lib1 = await openLibrary(file)
    await lib1.add('/m/keeper.mid')
    const lib2 = await openLibrary(file) // simulate server restart
    assert.deepEqual(
      lib2.list().map((e) => e.name),
      ['keeper.mid'],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
