import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildControllerResetMessages, buildAllNotesOffMessages, sendMessages } from '../lib/midiReset.mjs'

test('buildControllerResetMessages covers all 16 channels', () => {
  const messages = buildControllerResetMessages()
  const channels = new Set(messages.map((m) => m.data.channel))
  assert.equal(channels.size, 16)
})

test('buildControllerResetMessages sends the full GM reset per channel', () => {
  const messages = buildControllerResetMessages().filter((m) => m.data.channel === 0)
  const cc = (controller) => messages.find((m) => m.type === 'cc' && m.data.controller === controller)

  assert.equal(cc(120).data.value, 0) // all sound off
  assert.equal(cc(123).data.value, 0) // all notes off
  assert.equal(cc(121).data.value, 0) // reset all controllers
  assert.equal(cc(64).data.value, 0) // sustain off
  assert.equal(cc(1).data.value, 0) // mod wheel
  assert.equal(cc(11).data.value, 127) // expression max
  assert.equal(cc(7).data.value, 100) // channel volume default
  assert.equal(cc(10).data.value, 64) // pan center

  const pitch = messages.find((m) => m.type === 'pitch')
  assert.equal(pitch.data.value, 8192)

  const program = messages.find((m) => m.type === 'program')
  assert.equal(program.data.number, 0)
})

test('buildControllerResetMessages produces 10 messages per channel across all 16 channels', () => {
  assert.equal(buildControllerResetMessages().length, 160)
})

test('buildAllNotesOffMessages sends sustain-off + all-sound-off + all-notes-off per channel', () => {
  const messages = buildAllNotesOffMessages().filter((m) => m.data.channel === 0)
  const cc = (controller) => messages.find((m) => m.type === 'cc' && m.data.controller === controller)

  assert.equal(cc(64).data.value, 0) // sustain off
  assert.equal(cc(120).data.value, 0) // all sound off
  assert.equal(cc(123).data.value, 0) // all notes off
  assert.equal(messages.length, 3)
})

test('buildAllNotesOffMessages covers all 16 channels', () => {
  const channels = new Set(buildAllNotesOffMessages().map((m) => m.data.channel))
  assert.equal(channels.size, 16)
})

test('sendMessages sends every message to the given output', () => {
  const sent = []
  const out = { send: (type, data) => sent.push({ type, data }) }
  const messages = buildControllerResetMessages()

  sendMessages(out, messages)

  assert.deepEqual(sent, messages)
})
