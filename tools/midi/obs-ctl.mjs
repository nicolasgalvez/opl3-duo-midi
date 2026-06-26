// Tiny OBS WebSocket helper for the album render batch (run on proski from tools/midi).
//   node obs-ctl.mjs status   -> print OBS version + record status (JSON)
//   node obs-ctl.mjs stop     -> stop recording if active
import OBSWebSocket from 'obs-websocket-js'
const URL = process.env.OPL_OBS_URL || 'ws://127.0.0.1:4455'
const cmd = process.argv[2] || 'status'
const obs = new OBSWebSocket()
try {
  await obs.connect(URL)
  const ver = await obs.call('GetVersion')
  const rec = await obs.call('GetRecordStatus')
  if (cmd === 'stop' && rec.outputActive) { await obs.call('StopRecord'); console.log('stopped recording') }
  console.log(JSON.stringify({ ok: true, obs: ver.obsVersion, ws: ver.obsWebSocketVersion, recording: rec.outputActive, recDurationMs: rec.outputDuration }, null, 2))
  await obs.disconnect()
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }))
  process.exit(1)
}
