import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveObsOpts } from '../lib/obs.mjs'

test('resolveObsOpts defaults', () => {
  assert.deepEqual(resolveObsOpts({}, {}), {
    url: 'ws://127.0.0.1:4455',
    password: undefined,
    source: undefined,
  })
})

test('resolveObsOpts reads CLI flags', () => {
  assert.deepEqual(
    resolveObsOpts({ obsUrl: 'ws://192.168.1.5:4455', obsPassword: 'secret', obsSource: 'OPL Viz' }, {}),
    { url: 'ws://192.168.1.5:4455', password: 'secret', source: 'OPL Viz' },
  )
})

test('resolveObsOpts reads env vars', () => {
  assert.deepEqual(
    resolveObsOpts({}, { OPL_OBS_URL: 'ws://localhost:4455', OPL_OBS_PASSWORD: 'pw', OPL_OBS_SOURCE: 'Browser' }),
    { url: 'ws://localhost:4455', password: 'pw', source: 'Browser' },
  )
})

test('resolveObsOpts flags override env', () => {
  assert.equal(resolveObsOpts({ obsPassword: 'cli' }, { OPL_OBS_PASSWORD: 'env' }).password, 'cli')
})
