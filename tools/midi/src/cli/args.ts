import { z } from 'zod'

// yargs only *coerces* numeric options — `opl note c` arrives as NaN and used
// to be sent to the synth verbatim. These schemas gate every musical CLI
// argument with a clear error before anything reaches hardware.

export const MidiByteSchema = z.number().int().min(0).max(127)
export const ChannelSchema = z.number().int().min(1).max(16)
export const DurationSchema = z.number().positive().finite()

function requireValid<T>(schema: z.ZodType<T>, label: string, value: unknown, hint: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    console.error(`Invalid ${label} "${String(value)}" — expected ${hint}.`)
    process.exit(1)
  }
  return result.data
}

export function requireMidiByte(label: string, value: unknown, hint = 'a MIDI value 0-127'): number {
  return requireValid(MidiByteSchema, label, value, hint)
}

/** CLI-facing MIDI channel, 1-16 (the wire uses 0-15; callers subtract 1). */
export function requireChannel(value: unknown): number {
  return requireValid(ChannelSchema, 'channel', value, 'a MIDI channel 1-16')
}

export function requireDuration(value: unknown): number {
  return requireValid(DurationSchema, 'duration', value, 'a positive number of seconds')
}
