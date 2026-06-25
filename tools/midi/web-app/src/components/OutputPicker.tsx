import { useState, type ChangeEvent } from 'react'
import { useStore, type OutputMode } from '../store'
import { soundfontPlayer } from '../lib/soundfontPlayer'

// Chooses where audio comes from: the hardware OPL3 synth (server sends MIDI to
// the device) or an in-browser SoundFont (WebAudio). The choice persists; in
// SoundFont mode a `.sf2` can be loaded (otherwise the built-in default is used).
export default function OutputPicker() {
  const outputMode = useStore((s) => s.outputMode)
  const setOutputMode = useStore((s) => s.setOutputMode)
  const [sfName, setSfName] = useState(soundfontPlayer.loadedName)

  const onSf = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    await soundfontPlayer.loadSoundFont(await f.arrayBuffer(), f.name)
    setSfName(f.name)
  }

  return (
    <div className="output-picker">
      <select
        className="output-mode"
        aria-label="Output mode"
        value={outputMode}
        onChange={(e) => setOutputMode(e.target.value as OutputMode)}
      >
        <option value="hardware">Hardware MIDI</option>
        <option value="soundfont">SoundFont (browser)</option>
      </select>
      {outputMode === 'soundfont' && (
        <label className="sf-load" title={`SoundFont: ${sfName}`}>
          SF2…
          <input type="file" accept=".sf2,.sf3,.dls" hidden aria-label="Load SoundFont" onChange={onSf} />
        </label>
      )}
    </div>
  )
}
