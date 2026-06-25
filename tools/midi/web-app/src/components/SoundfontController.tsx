import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { soundfontPlayer } from '../lib/soundfontPlayer'

// Headless glue for SoundFont mode: loads the current track's MIDI into the
// browser synth when the selected track changes, and publishes the live master
// audio level on a data attribute (read by tests; the equalizer reads channel
// levels directly). Renders nothing visible.
export default function SoundfontController() {
  const outputMode = useStore((s) => s.outputMode)
  const index = useStore((s) => s.player?.index ?? -1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputMode !== 'soundfont' || index < 0) return
    void soundfontPlayer.loadMidiFromUrl(`/api/midi?index=${index}`)
  }, [outputMode, index])

  useEffect(() => {
    if (outputMode !== 'soundfont') return
    let raf = 0
    const tick = () => {
      if (ref.current) {
        ref.current.dataset.level = soundfontPlayer.level().toFixed(4)
        // Max per-channel level proves the synth's note events feed the equalizer.
        ref.current.dataset.ch = Math.max(0, ...soundfontPlayer.channelLevels()).toFixed(4)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [outputMode])

  if (outputMode !== 'soundfont') return null
  return <div ref={ref} data-testid="sf-meter" data-level="0" hidden />
}
