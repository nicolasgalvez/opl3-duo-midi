import { describe, it, expect } from 'vitest'
import { rms } from './audioLevel'

describe('rms', () => {
  it('is 0 for silence (empty or all-zero)', () => {
    expect(rms(new Float32Array(0))).toBe(0)
    expect(rms(new Float32Array([0, 0, 0, 0]))).toBe(0)
  })

  it('equals the constant level for a DC signal', () => {
    expect(rms(new Float32Array([0.5, 0.5, 0.5, 0.5]))).toBeCloseTo(0.5)
  })

  it('is 1 for a full-scale square wave', () => {
    expect(rms(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(1)
  })

  it('rises with amplitude', () => {
    expect(rms(new Float32Array([0.2, -0.2]))).toBeLessThan(rms(new Float32Array([0.8, -0.8])))
  })
})
