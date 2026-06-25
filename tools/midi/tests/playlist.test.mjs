import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { parseM3U, parseJSPF, isPlaylistFile, loadPlaylist } from '../lib/playlist.mjs'

// ── pure parsers ──────────────────────────────────────────────────────────

test('parseM3U keeps order and ignores comments, #EXTINF, and blank lines', () => {
  const m3u = ['#EXTM3U', '# a comment', 'c.mid', '#EXTINF:0,B track', 'b.mid', '', '  a.mid  '].join('\n')
  assert.deepEqual(parseM3U(m3u), ['c.mid', 'b.mid', 'a.mid'])
})

test('parseM3U handles CRLF line endings', () => {
  assert.deepEqual(parseM3U('#EXTM3U\r\nx.mid\r\ny.mid\r\n'), ['x.mid', 'y.mid'])
})

test('parseJSPF reads playlist.track[].location[0] in order', () => {
  const jspf = JSON.stringify({
    playlist: {
      title: 'demo',
      track: [{ location: ['b.mid'] }, { location: ['a.mid'] }, { location: ['c.mid'] }],
    },
  })
  assert.deepEqual(parseJSPF(jspf), ['b.mid', 'a.mid', 'c.mid'])
})

test('parseJSPF accepts a bare string location too', () => {
  const jspf = JSON.stringify({ playlist: { track: [{ location: 'only.mid' }] } })
  assert.deepEqual(parseJSPF(jspf), ['only.mid'])
})

test('parseJSPF throws on JSON that is not a JSPF playlist', () => {
  assert.throws(() => parseJSPF(JSON.stringify({ not: 'a playlist' })))
})

// ── extension detection ───────────────────────────────────────────────────

test('isPlaylistFile detects playlist extensions, case-insensitive', () => {
  assert.equal(isPlaylistFile('x.m3u'), true)
  assert.equal(isPlaylistFile('x.M3U8'), true)
  assert.equal(isPlaylistFile('x.jspf'), true)
  assert.equal(isPlaylistFile('song.mid'), false)
  assert.equal(isPlaylistFile('folder'), false)
})

// ── loadPlaylist resolves against the playlist's own dir, keeps order ───────

test('loadPlaylist resolves relative entries against the playlist dir and preserves order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opl-pl-'))
  try {
    for (const f of ['a.mid', 'b.mid', 'c.mid']) writeFileSync(join(dir, f), '')
    writeFileSync(join(dir, 'list.m3u'), '#EXTM3U\nc.mid\nb.mid\na.mid\nmissing.mid\n')

    const got = loadPlaylist(join(dir, 'list.m3u'))
    // missing.mid is skipped (not fatal); custom order c,b,a preserved (not alphabetical)
    assert.deepEqual(got, [join(dir, 'c.mid'), join(dir, 'b.mid'), join(dir, 'a.mid')])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadPlaylist parses JSPF and resolves entries relative to the playlist dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opl-pl-'))
  try {
    for (const f of ['a.mid', 'b.mid']) writeFileSync(join(dir, f), '')
    writeFileSync(
      join(dir, 'list.jspf'),
      JSON.stringify({ playlist: { track: [{ location: ['b.mid'] }, { location: ['a.mid'] }] } }),
    )

    assert.deepEqual(loadPlaylist(join(dir, 'list.jspf')), [join(dir, 'b.mid'), join(dir, 'a.mid')])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadPlaylist resolves file:// URIs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opl-pl-'))
  try {
    writeFileSync(join(dir, 'a.mid'), '')
    const uri = new URL(`file://${join(dir, 'a.mid')}`).href
    writeFileSync(join(dir, 'list.m3u'), `#EXTM3U\n${uri}\n`)
    assert.deepEqual(loadPlaylist(join(dir, 'list.m3u')), [join(dir, 'a.mid')])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
