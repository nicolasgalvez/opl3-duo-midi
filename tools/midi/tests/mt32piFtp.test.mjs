import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortSoundFontNames, findSoundFontIndex, isSoundFontFile } from '../lib/net/mt32piFtp.mjs'

// mt32-pi sorts its whole SoundFont list with strcasecmp() over the file path
// (src/soundfontmanager.cpp: SoundFontListComparator) — case-insensitive, and
// the CLI's computed index must match it exactly or SwitchSoundFont(index)
// picks the wrong font on the device.

test('sortSoundFontNames sorts case-insensitively', () => {
  assert.deepEqual(sortSoundFontNames(['Zelda.sf2', 'arachno.sf2', 'Chrono.sf2']), [
    'arachno.sf2',
    'Chrono.sf2',
    'Zelda.sf2',
  ])
})

test('sortSoundFontNames does not mutate the input array', () => {
  const input = ['b.sf2', 'a.sf2']
  sortSoundFontNames(input)
  assert.deepEqual(input, ['b.sf2', 'a.sf2'])
})

test('findSoundFontIndex resolves a numeric string directly to that index', () => {
  const names = ['arachno.sf2', 'Chrono.sf2', 'Zelda.sf2']
  assert.equal(findSoundFontIndex(names, '2'), 2)
})

test('findSoundFontIndex resolves a numeric value directly to that index', () => {
  const names = ['arachno.sf2', 'Chrono.sf2', 'Zelda.sf2']
  assert.equal(findSoundFontIndex(names, 0), 0)
})

test('findSoundFontIndex resolves an exact case-insensitive name match', () => {
  const names = ['arachno.sf2', 'Chrono.sf2', 'Zelda.sf2']
  assert.equal(findSoundFontIndex(names, 'chrono.sf2'), 1)
})

test('findSoundFontIndex falls back to a case-insensitive substring match', () => {
  const names = ['arachno.sf2', 'Chrono Trigger.sf2', 'Zelda.sf2']
  assert.equal(findSoundFontIndex(names, 'trigger'), 1)
})

test('findSoundFontIndex throws when nothing matches', () => {
  const names = ['arachno.sf2', 'Chrono.sf2']
  assert.throws(() => findSoundFontIndex(names, 'nonexistent'))
})

test('isSoundFontFile accepts .sf2/.sf3, case-insensitively', () => {
  assert.equal(isSoundFontFile('GeneralUser GS v1.511.sf2'), true)
  assert.equal(isSoundFontFile('compressed.SF3'), true)
})

test('isSoundFontFile rejects non-soundfont files the device would also skip', () => {
  assert.equal(isSoundFontFile('place-soundfonts-here.txt'), false)
  assert.equal(isSoundFontFile('GeneralUser GS v1.511.cfg'), false)
})
