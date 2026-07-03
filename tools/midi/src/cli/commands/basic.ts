import { GM_NAMES } from '../../core/gm.ts'
import { midiOutputs } from '../../adapters/midi/outputs.ts'
import { openOutput, allNotesOff, sleep, type GlobalArgv } from '../shared.ts'

export interface NoteArgv extends GlobalArgv {
  note: number
  vel: number
  dur: number
  ch: number
}

export interface ChordArgv extends GlobalArgv {
  notes: number[]
  vel: number
  dur: number
  ch: number
}

export interface ScaleArgv extends GlobalArgv {
  root: number
  vel: number
  dur: number
  ch: number
}

export interface PcArgv extends GlobalArgv {
  program: number
  ch: number
}

export interface CcArgv extends GlobalArgv {
  number: number
  value: number
  ch: number
}

export function cmdList(): void {
  console.log('MIDI outputs:')
  for (const n of midiOutputs()) console.log('  -', n)
}

export async function cmdNote(argv: NoteArgv): Promise<void> {
  const { out, name } = openOutput(argv)
  const ch = argv.ch - 1
  out.send('noteon', { note: argv.note, velocity: argv.vel, channel: ch })
  console.log(`${name}: note ${argv.note} ch${argv.ch} vel${argv.vel} for ${argv.dur}s`)
  await sleep(argv.dur * 1000)
  out.send('noteoff', { note: argv.note, velocity: 0, channel: ch })
  out.close()
}

export async function cmdChord(argv: ChordArgv): Promise<void> {
  const { out, name } = openOutput(argv)
  const ch = argv.ch - 1
  for (const n of argv.notes) out.send('noteon', { note: n, velocity: argv.vel, channel: ch })
  console.log(`${name}: chord ${argv.notes.join(' ')} ch${argv.ch} for ${argv.dur}s`)
  await sleep(argv.dur * 1000)
  for (const n of argv.notes) out.send('noteoff', { note: n, velocity: 0, channel: ch })
  out.close()
}

export async function cmdScale(argv: ScaleArgv): Promise<void> {
  const { out, name } = openOutput(argv)
  const ch = argv.ch - 1
  const scale = [0, 2, 4, 5, 7, 9, 11, 12].map((s) => argv.root + s)
  console.log(`${name}: scale from ${argv.root} ch${argv.ch}`)
  for (const n of scale) {
    out.send('noteon', { note: n, velocity: argv.vel, channel: ch })
    await sleep(argv.dur * 1000)
    out.send('noteoff', { note: n, velocity: 0, channel: ch })
  }
  out.close()
}

export function cmdPc(argv: PcArgv): void {
  const { out, name } = openOutput(argv)
  out.send('program', { number: argv.program, channel: argv.ch - 1 })
  const label = GM_NAMES[argv.program] ?? '?'
  console.log(`${name}: program change ch${argv.ch} -> ${argv.program} (${label})`)
  out.close()
}

export function cmdCc(argv: CcArgv): void {
  const { out, name } = openOutput(argv)
  out.send('cc', { controller: argv.number, value: argv.value, channel: argv.ch - 1 })
  console.log(`${name}: cc ${argv.number} = ${argv.value} ch${argv.ch}`)
  out.close()
}

export function cmdPanic(argv: GlobalArgv): void {
  const { out, name } = openOutput(argv)
  allNotesOff(out)
  console.log(`${name}: panic — all sound/notes off`)
  out.close()
}
