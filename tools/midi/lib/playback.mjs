/** Fisher–Yates shuffle of [0..length-1]. `random` returns [0,1). */
export function shuffleOrder(length, random = Math.random) {
  const order = [...Array(length).keys()]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

function posInOrder(index, order) {
  const pos = order.indexOf(index)
  return pos >= 0 ? pos : 0
}

/** Next playlist index after `index`, or null to stop. */
export function nextPlaylistIndex({ index, length, repeat, shuffle, order = [] }) {
  if (length === 0) return null
  if (shuffle && order.length === length) {
    const pos = posInOrder(index, order)
    const nextPos = pos + 1
    if (nextPos < order.length) return order[nextPos]
    return repeat ? order[0] : null
  }
  const next = index + 1
  if (next < length) return next
  return repeat ? 0 : null
}

/** Previous playlist index before `index`. */
export function prevPlaylistIndex({ index, length, shuffle, order = [] }) {
  if (length === 0) return 0
  if (shuffle && order.length === length) {
    const pos = posInOrder(index, order)
    return order[pos > 0 ? pos - 1 : 0]
  }
  return index > 0 ? index - 1 : 0
}
