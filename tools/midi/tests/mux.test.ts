import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAvOffset, buildMuxArgs } from '../src/core/mux.ts'

test('resolveAvOffset defaults to 0', () => {
  assert.equal(resolveAvOffset({}, {}), 0)
})

test('resolveAvOffset reads --av-offset flag', () => {
  assert.equal(resolveAvOffset({ avOffset: 250 }, {}), 250)
  assert.equal(resolveAvOffset({ avOffset: -120 }, {}), -120)
})

test('resolveAvOffset reads OPL_AV_OFFSET env', () => {
  assert.equal(resolveAvOffset({}, { OPL_AV_OFFSET: '300' }), 300)
})

test('resolveAvOffset flag overrides env', () => {
  assert.equal(resolveAvOffset({ avOffset: 50 }, { OPL_AV_OFFSET: '300' }), 50)
})

test('buildMuxArgs with zero offset has no itsoffset', () => {
  const args = buildMuxArgs({
    videoFile: 'v.mkv',
    audioFile: 'a.wav',
    outPath: 'out.mp4',
    fps: 30,
    avOffsetMs: 0,
  })
  assert.deepEqual(args.slice(0, 4), ['-i', 'v.mkv', '-i', 'a.wav'])
  assert.equal(args.includes('-itsoffset'), false)
})

test('buildMuxArgs positive offset delays audio', () => {
  const args = buildMuxArgs({
    videoFile: 'v.mkv',
    audioFile: 'a.wav',
    outPath: 'out.mp4',
    fps: 30,
    avOffsetMs: 200,
  })
  const i = args.indexOf('-i')
  assert.deepEqual(args.slice(i, i + 6), ['-i', 'v.mkv', '-itsoffset', '0.200', '-i', 'a.wav'])
})

test('buildMuxArgs negative offset delays video', () => {
  const args = buildMuxArgs({
    videoFile: 'v.mkv',
    audioFile: 'a.wav',
    outPath: 'out.mp4',
    fps: 30,
    avOffsetMs: -150,
  })
  assert.deepEqual(args.slice(0, 6), ['-itsoffset', '0.150', '-i', 'v.mkv', '-i', 'a.wav'])
})

test('buildMuxArgs includes encode and output flags', () => {
  const args = buildMuxArgs({
    videoFile: 'v.mkv',
    audioFile: 'a.wav',
    outPath: 'out.mp4',
    fps: 30,
    avOffsetMs: 0,
  })
  assert.equal(args.at(-1), 'out.mp4')
  assert.equal(args.includes('-shortest'), true)
  assert.equal(args.includes('-r'), true)
  assert.equal(args[args.indexOf('-r') + 1], '30')
})
