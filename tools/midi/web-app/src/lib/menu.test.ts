import { describe, it, expect } from 'vitest'
import { MENUS } from './menu'

describe('MENUS', () => {
  it('exposes File, Edit, and View menus in order', () => {
    expect(MENUS.map((m) => m.title)).toEqual(['File', 'Edit', 'View'])
  })

  it('File can open playlists (the ODM-1 .m3u/.jspf formats)', () => {
    const file = MENUS.find((m) => m.title === 'File')
    expect(file?.items.some((i) => i.id === 'file.openPlaylist')).toBe(true)
  })

  it('View can switch theme and layout and toggle panels', () => {
    const ids = MENUS.find((m) => m.title === 'View')?.items.map((i) => i.id) ?? []
    expect(ids).toContain('view.theme.winamp')
    expect(ids).toContain('view.layout.minimized')
    expect(ids).toContain('view.togglePlaylist')
    expect(ids).toContain('view.toggleEqualizer')
  })

  it('has no duplicate action ids', () => {
    const ids = MENUS.flatMap((m) => m.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
