import { statSync } from 'node:fs'
import type OBSWebSocket from 'obs-websocket-js'

export interface ObsOpts {
  url: string
  password: string | undefined
  source: string | undefined
}

/** Default OBS WebSocket connection settings from CLI argv and env. */
export function resolveObsOpts(
  argv: { obsUrl?: string; obsPassword?: string; obsSource?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): ObsOpts {
  return {
    url: argv.obsUrl || env.OPL_OBS_URL || 'ws://127.0.0.1:4455',
    password: argv.obsPassword || env.OPL_OBS_PASSWORD || undefined,
    source: argv.obsSource || env.OPL_OBS_SOURCE || undefined,
  }
}

/** Connect to a running OBS Studio instance (WebSocket v5). */
export async function connectObs({ url, password }: { url: string; password?: string }) {
  let ObsCtor: typeof OBSWebSocket
  try {
    ObsCtor = (await import('obs-websocket-js')).default
  } catch {
    throw new Error('obs-websocket-js is required for `opl render --obs`. Run: npm install (from repo root)')
  }

  const obs = new ObsCtor()
  try {
    const info = await obs.connect(url, password)
    return { obs, info }
  } catch (e) {
    const msg = (e as { message?: string })?.message || String(e)
    throw new Error(`Could not connect to OBS at ${url}. Is OBS running with WebSocket enabled? (${msg})`, { cause: e })
  }
}

/** Ensure OBS is idle, then start recording. */
export async function startObsRecording(obs: OBSWebSocket): Promise<void> {
  const { outputActive } = await obs.call('GetRecordStatus')
  if (outputActive) {
    throw new Error('OBS is already recording. Stop the current recording before using --obs.')
  }
  await obs.call('StartRecord')
}

/** Stop OBS recording and return the written file path. */
export async function stopObsRecording(obs: OBSWebSocket): Promise<string> {
  const { outputActive } = await obs.call('GetRecordStatus')
  if (!outputActive) {
    throw new Error('OBS recording is not active.')
  }
  const { outputPath } = await obs.call('StopRecord')
  if (!outputPath) {
    throw new Error('OBS stopped recording but did not return an output path.')
  }
  return outputPath
}

/** Point an existing OBS browser source at the visualizer URL and canvas size. */
export async function setBrowserSourceUrl(
  obs: OBSWebSocket,
  inputName: string,
  url: string,
  width: number,
  height: number,
): Promise<void> {
  await obs.call('SetInputSettings', {
    inputName,
    inputSettings: {
      url,
      width,
      height,
      fps: 30,
      shutdown: false,
      restart_when_active: false,
    },
    overlay: true,
  })
}

/** Wait until OBS reports an active recording (StartRecord is async). */
export async function waitForObsRecording(obs: OBSWebSocket, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { outputActive } = await obs.call('GetRecordStatus')
    if (outputActive) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('OBS did not start recording within 5s.')
}

/** Poll until the recorded file exists AND its size has stopped growing (OBS finishes
 *  flushing/finalizing the container a moment after StopRecord resolves — reading too
 *  early can hand ffmpeg a truncated EBML header). */
export async function waitForFile(path: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastSize = -1
  while (Date.now() < deadline) {
    try {
      const { size } = statSync(path)
      if (size > 0 && size === lastSize) return
      lastSize = size
    } catch {
      /* not written yet */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timed out waiting for OBS output file: ${path}`)
}
