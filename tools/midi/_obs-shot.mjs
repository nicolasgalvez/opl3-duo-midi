import OBSWebSocket from 'obs-websocket-js'
const o = new OBSWebSocket()
await o.connect('ws://127.0.0.1:4455')
const src = process.argv[2] || 'Browser 2'
const out = process.argv[3] || '/tmp/obs-shot.png'
await o.call('SaveSourceScreenshot', {
  sourceName: src,
  imageFormat: 'png',
  imageFilePath: out,
  imageWidth: 1280,
  imageHeight: 720,
})
console.log('saved screenshot of', src, '->', out)
await o.disconnect()
