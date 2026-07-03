// Pure playlist mutations that also keep the "current" pointer aimed at the
// same track, so editing the queue never disrupts what's playing. Returns a new
// array plus the adjusted current index (-1 when the list becomes empty).

export interface PlaylistEditResult<T> {
  items: T[]
  current: number
}

export function removeTrack<T>(items: T[], current: number, removeIdx: number): PlaylistEditResult<T> {
  if (removeIdx < 0 || removeIdx >= items.length) return { items, current }
  const next = items.slice(0, removeIdx).concat(items.slice(removeIdx + 1))
  if (next.length === 0) return { items: next, current: -1 }
  let index = current
  if (removeIdx < current) index = current - 1
  else if (removeIdx === current) index = Math.min(current, next.length - 1)
  return { items: next, current: index }
}

export function moveTrack<T>(items: T[], current: number, from: number, to: number): PlaylistEditResult<T> {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return { items, current }
  }
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)

  // Track where the currently-playing item lands.
  let index = current
  if (current === from) {
    index = to
  } else {
    if (from < current) index -= 1
    if (to <= current) index += 1
  }
  return { items: next, current: index }
}
