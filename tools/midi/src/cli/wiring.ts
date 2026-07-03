import { writeFileSync } from 'node:fs'

import { Engine, type EngineDeps } from '../core/engine.ts'
import { midiOutputs, openUsbOutput } from '../adapters/midi/outputs.ts'
import { UdpMidiOutput } from '../adapters/net/udpMidiOutput.ts'
import { collectFiles, buildEventList } from '../adapters/fs/tracks.ts'

// The composition root: the one place that hands the core its real adapters.
const engineDeps: EngineDeps = {
  listOutputs: midiOutputs,
  openUsbOutput,
  openNetOutput: (host, port) => new UdpMidiOutput(host, port),
  collectFiles,
  buildEventList,
  writeFile: (path, body) => writeFileSync(path, body),
}

export function createEngine(): Engine {
  return new Engine(engineDeps)
}
