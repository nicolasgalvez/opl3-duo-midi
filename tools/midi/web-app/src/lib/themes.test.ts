import { describe, it, expect } from 'vitest'
import { THEMES } from './themes'
import { contrastRatio, AA_TEXT, AA_LARGE } from './contrast'

// Every theme must meet WCAG 2.2 AA. Text-on-surface pairs require 4.5:1;
// the accent (used for large titles / UI emphasis) requires at least 3:1.
describe.each(THEMES)('theme "$name" meets WCAG 2.2 AA', (theme) => {
  const t = theme.tokens

  it('primary text on background and panel ≥ 4.5:1', () => {
    expect(contrastRatio(t.fg, t.bg)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrastRatio(t.fg, t.panel)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('secondary (dim) text on background and panel ≥ 4.5:1', () => {
    expect(contrastRatio(t.dim, t.bg)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrastRatio(t.dim, t.panel)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('menu text stays readable on hover ≥ 4.5:1', () => {
    expect(contrastRatio(t.fg, t.menuHover)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('accent on background ≥ 3:1 (large text / UI)', () => {
    expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(AA_LARGE)
  })
})

describe('theme registry', () => {
  it('has unique names and non-empty labels', () => {
    const names = THEMES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(THEMES.every((t) => t.label.length > 0)).toBe(true)
  })
})
