import { GM_NAMES } from '../../core/gm.ts'
import { midiOutputs } from '../../adapters/midi/outputs.ts'
import type { MidiOutput } from '../../ports/midiOutput.ts'
import { openOutput, allNotesOff, sleep, type GlobalArgv } from '../shared.ts'
import { requireMidiByte, requireChannel, requireDuration } from '../args.ts'

export interface NoteArgv extends GlobalArgv {
  note: number
  vel: number
  dur: number
  ch: number
  pc?: number
}

export interface ChordArgv extends GlobalArgv {
  notes: number[]
  vel: number
  dur: number
  ch: number
  pc?: number
}

export interface ScaleArgv extends GlobalArgv {
  root: number
  vel: number
  dur: number
  ch: number
  pc?: number
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

const NOTE_HINT = 'a MIDI note number 0-127 (60 = middle C)'
const PROGRAM_HINT = 'a GM program 0-127'

/** Resolve an optional --pc flag; when set, the caller sends it before its notes. */
function optionalProgram(pc: number | undefined): number | undefined {
  return pc === undefined ? undefined : requireMidiByte('program', pc, PROGRAM_HINT)
}

function sendProgram(out: MidiOutput, program: number | undefined, channel: number): string {
  if (program === undefined) return ''
  out.send('program', { number: program, channel })
  return `  [pc ${program} ${GM_NAMES[program] ?? '?'}]`
}

export function cmdList(): void {
  console.log('MIDI outputs:')
  for (const n of midiOutputs()) console.log('  -', n)
}

export async function cmdNote(argv: NoteArgv): Promise<void> {
  const note = requireMidiByte('note', argv.note, NOTE_HINT)
  const vel = requireMidiByte('velocity', argv.vel)
  const dur = requireDuration(argv.dur)
  const chArg = requireChannel(argv.ch)
  const program = optionalProgram(argv.pc)
  const { out, name } = openOutput(argv)
  const ch = chArg - 1
  const pcLabel = sendProgram(out, program, ch)
  out.send('noteon', { note, velocity: vel, channel: ch })
  console.log(`${name}: note ${note} ch${chArg} vel${vel} for ${dur}s${pcLabel}`)
  await sleep(dur * 1000)
  out.send('noteoff', { note, velocity: 0, channel: ch })
  out.close()
}

export async function cmdChord(argv: ChordArgv): Promise<void> {
  const notes = argv.notes.map((n) => requireMidiByte('note', n, NOTE_HINT))
  const vel = requireMidiByte('velocity', argv.vel)
  const dur = requireDuration(argv.dur)
  const chArg = requireChannel(argv.ch)
  const program = optionalProgram(argv.pc)
  const { out, name } = openOutput(argv)
  const ch = chArg - 1
  const pcLabel = sendProgram(out, program, ch)
  for (const n of notes) out.send('noteon', { note: n, velocity: vel, channel: ch })
  console.log(`${name}: chord ${notes.join(' ')} ch${chArg} for ${dur}s${pcLabel}`)
  await sleep(dur * 1000)
  for (const n of notes) out.send('noteoff', { note: n, velocity: 0, channel: ch })
  out.close()
}

export async function cmdScale(argv: ScaleArgv): Promise<void> {
  const root = requireMidiByte('root', argv.root, NOTE_HINT)
  const vel = requireMidiByte('velocity', argv.vel)
  const dur = requireDuration(argv.dur)
  const chArg = requireChannel(argv.ch)
  const program = optionalProgram(argv.pc)
  const { out, name } = openOutput(argv)
  const ch = chArg - 1
  const pcLabel = sendProgram(out, program, ch)
  const scale = [0, 2, 4, 5, 7, 9, 11, 12].map((s) => root + s)
  console.log(`${name}: scale from ${root} ch${chArg}${pcLabel}`)
  for (const n of scale) {
    out.send('noteon', { note: n, velocity: vel, channel: ch })
    await sleep(dur * 1000)
    out.send('noteoff', { note: n, velocity: 0, channel: ch })
  }
  out.close()
}

export function cmdPc(argv: PcArgv): void {
  const program = requireMidiByte('program', argv.program, 'a GM program 0-127')
  const chArg = requireChannel(argv.ch)
  const { out, name } = openOutput(argv)
  out.send('program', { number: program, channel: chArg - 1 })
  const label = GM_NAMES[program] ?? '?'
  console.log(`${name}: program change ch${chArg} -> ${program} (${label})`)
  out.close()
}

export function cmdCc(argv: CcArgv): void {
  const controller = requireMidiByte('CC number', argv.number)
  const value = requireMidiByte('CC value', argv.value)
  const chArg = requireChannel(argv.ch)
  const { out, name } = openOutput(argv)
  out.send('cc', { controller, value, channel: chArg - 1 })
  console.log(`${name}: cc ${controller} = ${value} ch${chArg}`)
  out.close()
}

export async function cmdPanic(argv: GlobalArgv): Promise<void> {
  const { out, name } = openOutput(argv)
  await out.ready?.() // 48-message burst below would overflow a cold ARP hold queue
  allNotesOff(out)
  console.log(`${name}: panic — all sound/notes off`)
  out.close()
}
