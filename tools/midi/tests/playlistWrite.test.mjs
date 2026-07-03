import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toM3U, toJSPF } from '../src/core/playlistWrite.ts'
import { parseM3U, parseJSPF } from '../lib/playlist.mjs'

test('toM3U emits an #EXTM3U header and one path per line, in order', () => {
  const out = toM3U(['/a/x.mid', '/a/y.mid'])
  assert.equal(out.split('\n')[0], '#EXTM3U')
  assert.deepEqual(
    out
      .trim()
      .split('\n')
      .filter((l) => !l.startsWith('#')),
    ['/a/x.mid', '/a/y.mid'],
  )
})

test('toJSPF emits valid JSPF with locations in order', () => {
  const out = toJSPF(['/a/x.mid', '/a/y.mid'], { title: 'set' })
  const data = JSON.parse(out)
  assert.equal(data.playlist.title, 'set')
  assert.deepEqual(
    data.playlist.track.map((t) => t.location[0]),
    ['/a/x.mid', '/a/y.mid'],
  )
})

// Writer/reader round-trip: what we write, ODM-1's loader reads back identically.
test('M3U round-trips through parseM3U preserving order', () => {
  const paths = ['/m/c.mid', '/m/a.mid', '/m/b.mid']
  assert.deepEqual(parseM3U(toM3U(paths)), paths)
})

test('JSPF round-trips through parseJSPF preserving order', () => {
  const paths = ['/m/c.mid', '/m/a.mid', '/m/b.mid']
  assert.deepEqual(parseJSPF(toJSPF(paths)), paths)
})
