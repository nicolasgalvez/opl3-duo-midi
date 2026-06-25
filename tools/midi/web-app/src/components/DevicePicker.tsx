import { api } from '../lib/api'
import { useStore } from '../store'

export default function DevicePicker() {
  const player = useStore((s) => s.player)

  return (
    <select
      className="device"
      aria-label="MIDI output device"
      value={player?.device ?? ''}
      onChange={(e) => api('device', { name: e.target.value })}
    >
      {(player?.devices ?? []).map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  )
}
