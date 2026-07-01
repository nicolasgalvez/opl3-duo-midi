const CC_RESETS = [
  [120, 0], // all sound off
  [123, 0], // all notes off
  [121, 0], // reset all controllers
  [64, 0], // sustain off
  [1, 0], // mod wheel 0
  [11, 127], // expression max
  [7, 100], // channel volume default
  [10, 64], // pan center
]

/** Full GM-style per-channel reset messages: silences notes and resets controller
 *  state (mod wheel, pitch bend, sustain, expression, volume, pan, program) so it
 *  can't bleed from one track into the next in album/playlist mode. */
export function buildControllerResetMessages() {
  const messages = []
  for (let channel = 0; channel < 16; channel++) {
    for (const [controller, value] of CC_RESETS) {
      messages.push({ type: 'cc', data: { controller, value, channel } })
    }
    messages.push({ type: 'pitch', data: { value: 8192, channel } })
    messages.push({ type: 'program', data: { number: 0, channel } })
  }
  return messages
}
