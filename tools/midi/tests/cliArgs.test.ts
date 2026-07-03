import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MidiByteSchema, ChannelSchema, DurationSchema } from '../src/cli/args.ts'

// yargs only *coerces* numeric options — `opl note c` arrives as NaN, and
// used to be sent to the synth verbatim ("note NaN ch1"). These schemas
// gate every musical CLI argument before it reaches hardware.

test('MidiByteSchema accepts the full 0-127 range', () => {
  assert.equal(MidiByteSchema.parse(0), 0)
  assert.equal(MidiByteSchema.parse(60), 60)
  assert.equal(MidiByteSchema.parse(127), 127)
})

test('MidiByteSchema rejects NaN (yargs coercion of a non-numeric arg)', () => {
  assert.equal(MidiByteSchema.safeParse(NaN).success, false)
})

test('MidiByteSchema rejects out-of-range and fractional values', () => {
  assert.equal(MidiByteSchema.safeParse(-1).success, false)
  assert.equal(MidiByteSchema.safeParse(128).success, false)
  assert.equal(MidiByteSchema.safeParse(60.5).success, false)
})

test('ChannelSchema accepts CLI channels 1-16 and rejects 0/17/NaN', () => {
  assert.equal(ChannelSchema.parse(1), 1)
  assert.equal(ChannelSchema.parse(16), 16)
  assert.equal(ChannelSchema.safeParse(0).success, false)
  assert.equal(ChannelSchema.safeParse(17).success, false)
  assert.equal(ChannelSchema.safeParse(NaN).success, false)
})

test('DurationSchema accepts positive seconds and rejects 0/negative/NaN', () => {
  assert.equal(DurationSchema.parse(0.5), 0.5)
  assert.equal(DurationSchema.safeParse(0).success, false)
  assert.equal(DurationSchema.safeParse(-1).success, false)
  assert.equal(DurationSchema.safeParse(NaN).success, false)
})
