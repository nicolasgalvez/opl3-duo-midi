import { useStore, type OutputMode } from '../store'

// Chooses where audio comes from: the hardware OPL3 synth (server sends MIDI to
// the device) or an in-browser SoundFont (ODM-5, WebAudio). The choice persists.
export default function OutputPicker() {
  const outputMode = useStore((s) => s.outputMode)
  const setOutputMode = useStore((s) => s.setOutputMode)

  return (
    <select
      className="output-mode"
      aria-label="Output mode"
      value={outputMode}
      onChange={(e) => setOutputMode(e.target.value as OutputMode)}
    >
      <option value="hardware">Hardware MIDI</option>
      <option value="soundfont">SoundFont (browser)</option>
    </select>
  )
}
