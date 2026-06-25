import { useEffect, useRef } from 'react'
import { connectEvents } from '../lib/sse'
import { makeChannel, channelLevel, levelBand, type ChannelState, type EqBand } from '../lib/eq'
import { useStore } from '../store'
import { soundfontPlayer } from '../lib/soundfontPlayer'

const CH = 16
const BAND_COLORS: Record<EqBand, string> = {
  off: '#0f3d20',
  low: '#4af07a',
  mid: '#ffcc33',
  high: '#ff5a5a',
}

export default function Equalizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const outputMode = useStore((s) => s.outputMode)
  const modeRef = useRef(outputMode)
  modeRef.current = outputMode

  useEffect(() => {
    const channels: ChannelState[] = Array.from({ length: CH }, makeChannel)

    const disconnect = connectEvents((e) => {
      if (e.type === 'reset') {
        channels.forEach((c) => {
          c.notes.clear()
          c.vol = 1
          c.exp = 1
        })
      } else if (e.type === 'ev') {
        const c = channels[e.c]
        if (!c) return
        if (e.k === 'on') c.notes.set(e.a, e.b)
        else if (e.k === 'off') c.notes.delete(e.a)
        else if (e.k === 'cc') {
          if (e.a === 7) c.vol = e.b / 127
          else if (e.a === 11) c.exp = e.b / 127
          else if (e.a === 120 || e.a === 123) c.notes.clear()
        }
      }
    })

    let raf = 0
    const draw = () => {
      const cv = canvasRef.current
      const ctx = cv?.getContext('2d')
      if (cv && ctx) {
        const { width, height } = cv
        ctx.clearRect(0, 0, width, height)
        // In SoundFont mode the synth feeds its own channel levels; otherwise
        // use the SSE-fed channel model (hardware playback).
        const sfLevels = modeRef.current === 'soundfont' ? soundfontPlayer.channelLevels() : null
        const bw = width / CH
        for (let i = 0; i < CH; i++) {
          const lvl = sfLevels ? sfLevels[i] : channelLevel(channels[i])
          const bh = lvl * height
          ctx.fillStyle = BAND_COLORS[levelBand(lvl)]
          ctx.fillRect(i * bw + 1, height - bh, bw - 2, bh)
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="eq" width={640} height={180} aria-label="16-channel equalizer" />
}
