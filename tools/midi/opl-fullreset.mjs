// Full MIDI reset for the OPL3 Duo, to run between songs.
// Silences notes, resets all controllers/pitch/sustain/program on all 16 channels,
// then sends a MIDI System Reset (0xFF) which the firmware turns into a full
// OplSynth::systemReset() -> _opl3.begin() (re-inits the OPL3 chips).
import easymidi from 'easymidi'

const wanted = process.argv[2] || 'OPL3Duo'
const outs = easymidi.getOutputs()
const name = outs.find((n) => n.includes(wanted)) || outs[0]
if (!name) {
  console.error('no MIDI outputs found')
  process.exit(1)
}
const out = new easymidi.Output(name)

for (let ch = 0; ch < 16; ch++) {
  out.send('cc', { controller: 120, value: 0, channel: ch })   // all sound off
  out.send('cc', { controller: 123, value: 0, channel: ch })   // all notes off
  out.send('cc', { controller: 121, value: 0, channel: ch })   // reset all controllers
  out.send('cc', { controller: 64, value: 0, channel: ch })    // sustain off
  out.send('cc', { controller: 1, value: 0, channel: ch })     // mod wheel 0
  out.send('cc', { controller: 11, value: 127, channel: ch })  // expression full
  out.send('pitch', { value: 8192, channel: ch })              // pitch bend center
  out.send('program', { number: 0, channel: ch })              // program 0
}
out.send('reset') // 0xFF System Reset -> firmware systemReset() / OPL3 re-init

// give CoreMIDI time to flush the burst before closing
setTimeout(() => {
  out.close()
  console.log(`full MIDI reset sent to "${name}" (16 ch + system reset)`)
}, 300)
