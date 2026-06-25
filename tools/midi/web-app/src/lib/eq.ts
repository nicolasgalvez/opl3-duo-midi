// Pure per-channel level model for the 16-channel equalizer, fed by the live
// note/CC event stream. Mirrors the legacy web/app.js maths so the visualizer
// behaves identically against the same backend.

export interface ChannelState {
  notes: Map<number, number> // note -> velocity (0..127)
  vol: number // CC7 channel volume, 0..1
  exp: number // CC11 expression, 0..1
}

export function makeChannel(): ChannelState {
  return { notes: new Map(), vol: 1, exp: 1 }
}

/** Instantaneous channel level 0..1: loudest held note scaled by volume × expression. */
export function channelLevel(c: ChannelState): number {
  let peak = 0
  for (const vel of c.notes.values()) if (vel > peak) peak = vel
  return Math.min(1, (peak / 127) * c.vol * c.exp)
}

export type EqBand = 'off' | 'low' | 'mid' | 'high'

/** Map a 0..1 level onto a colour band for the equalizer bars. */
export function levelBand(level: number): EqBand {
  if (level <= 0) return 'off'
  if (level < 0.4) return 'low'
  if (level < 0.75) return 'mid'
  return 'high'
}
