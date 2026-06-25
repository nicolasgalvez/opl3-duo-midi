import { describe, it, expect } from 'vitest'
import { makeChannel, channelLevel, levelBand } from './eq'

describe('channelLevel', () => {
  it('is 0 with no notes held', () => {
    expect(channelLevel(makeChannel())).toBe(0)
  })

  it('scales the loudest note by volume and expression', () => {
    const c = makeChannel()
    c.notes.set(60, 127)
    expect(channelLevel(c)).toBeCloseTo(1)
    c.vol = 0.5
    expect(channelLevel(c)).toBeCloseTo(0.5)
    c.exp = 0.5
    expect(channelLevel(c)).toBeCloseTo(0.25)
  })

  it('uses the peak velocity among held notes', () => {
    const c = makeChannel()
    c.notes.set(60, 40)
    c.notes.set(64, 100)
    expect(channelLevel(c)).toBeCloseTo(100 / 127)
  })
})

describe('levelBand', () => {
  it('maps levels onto colour bands', () => {
    expect(levelBand(0)).toBe('off')
    expect(levelBand(0.2)).toBe('low')
    expect(levelBand(0.5)).toBe('mid')
    expect(levelBand(0.9)).toBe('high')
  })
})
