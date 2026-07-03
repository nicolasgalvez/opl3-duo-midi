import { statSync } from 'node:fs'
import { basename } from 'node:path'
import type { Argv } from 'yargs'

import { Mt32Pi } from '../../core/mt32pi.ts'
import { resolveNetTarget } from '../../core/deviceTarget.ts'
import type { NetTarget } from '../../contracts/net.ts'
import { UdpMidiOutput } from '../../adapters/net/udpMidiOutput.ts'
import {
  listSoundFonts,
  resolveSoundFontIndex,
  uploadSoundFont,
  DEFAULT_FTP_PORT,
  DEFAULT_FTP_USER,
  DEFAULT_FTP_PASSWORD,
  type Mt32PiFtpOptions,
} from '../../adapters/net/mt32piFtp.ts'
import { sleep, type GlobalArgv } from '../shared.ts'
import { requireChannel, requireDuration } from '../args.ts'

export interface Mt32FtpArgv extends GlobalArgv {
  ftpPort?: number
  ftpUser?: string
  ftpPassword?: string
  disk?: string
}

function requireMt32Target(argv: GlobalArgv): NetTarget {
  const net = resolveNetTarget(argv)
  if (!net) {
    console.error('mt32 commands need a network target: pass --host <ip> (or set OPL_MIDI_HOST).')
    process.exit(1)
  }
  return net
}

function mt32Device(net: NetTarget): Mt32Pi<UdpMidiOutput> {
  return new Mt32Pi(new UdpMidiOutput(net.host, net.port))
}

function mt32FtpOpts(argv: Mt32FtpArgv, net: NetTarget): Mt32PiFtpOptions {
  return {
    host: net.host,
    port: Number(argv.ftpPort || process.env.MT32PI_FTP_PORT || DEFAULT_FTP_PORT),
    user: argv.ftpUser || process.env.MT32PI_FTP_USER || DEFAULT_FTP_USER,
    password: argv.ftpPassword || process.env.MT32PI_FTP_PASSWORD || DEFAULT_FTP_PASSWORD,
    disk: argv.disk || 'sd',
  }
}

export function addMt32FtpOptions(y: Argv): Argv {
  return y
    .option('ftp-port', { type: 'number', describe: `FTP port (default ${DEFAULT_FTP_PORT}; or MT32PI_FTP_PORT)` })
    .option('ftp-user', {
      type: 'string',
      describe: `FTP username (default "${DEFAULT_FTP_USER}"; or MT32PI_FTP_USER)`,
    })
    .option('ftp-password', {
      type: 'string',
      describe: `FTP password (default "${DEFAULT_FTP_PASSWORD}"; or MT32PI_FTP_PASSWORD)`,
    })
    .option('disk', {
      type: 'string',
      choices: ['sd', 'usb'],
      default: 'sd',
      describe: 'storage volume containing /soundfonts',
    })
}

export function cmdMt32Reboot(argv: GlobalArgv): void {
  const net = requireMt32Target(argv)
  const device = mt32Device(net)
  device.reboot()
  console.log(`net://${net.host}:${net.port}: reboot`)
  device.out.close()
}

export function cmdMt32Rom(argv: GlobalArgv & { romSet: string }): void {
  const net = requireMt32Target(argv)
  const device = mt32Device(net)
  device.switchRomSet(argv.romSet)
  console.log(`net://${net.host}:${net.port}: switch MT-32 ROM set -> ${argv.romSet}`)
  device.out.close()
}

export function cmdMt32Synth(argv: GlobalArgv & { synth: string }): void {
  const net = requireMt32Target(argv)
  const device = mt32Device(net)
  device.switchSynth(argv.synth)
  console.log(`net://${net.host}:${net.port}: switch synth -> ${argv.synth}`)
  device.out.close()
}

export function cmdMt32Stereo(argv: GlobalArgv & { state: string }): void {
  const net = requireMt32Target(argv)
  const device = mt32Device(net)
  device.setReversedStereo(argv.state === 'on')
  console.log(`net://${net.host}:${net.port}: reversed stereo -> ${argv.state}`)
  device.out.close()
}

export async function cmdMt32SoundFonts(argv: Mt32FtpArgv): Promise<void> {
  const net = requireMt32Target(argv)
  const names = await listSoundFonts(mt32FtpOpts(argv, net))
  if (names.length === 0) {
    console.log('No SoundFonts found.')
    return
  }
  names.forEach((n, i) => console.log(`  [${i}] ${n}`))
}

export async function cmdMt32SoundFont(argv: Mt32FtpArgv & { nameOrIndex: string }): Promise<void> {
  const net = requireMt32Target(argv)
  let index: number
  try {
    index = await resolveSoundFontIndex(mt32FtpOpts(argv, net), argv.nameOrIndex)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
  const device = mt32Device(net)
  device.switchSoundFont(index)
  console.log(`net://${net.host}:${net.port}: switch SoundFont -> [${index}] ${argv.nameOrIndex}`)
  device.out.close()
}

export async function cmdMt32Upload(argv: Mt32FtpArgv & { file: string }): Promise<void> {
  const net = requireMt32Target(argv)
  const ftpOpts = mt32FtpOpts(argv, net)
  try {
    statSync(argv.file)
  } catch {
    console.error(`File not found: ${argv.file}`)
    process.exit(1)
  }
  await uploadSoundFont(ftpOpts, argv.file)
  console.log(`Uploaded ${basename(argv.file)} -> ${net.host}:${(ftpOpts.disk ?? 'sd').toUpperCase()}/soundfonts`)
}

export async function cmdMt32Test(argv: GlobalArgv & { ch: number; dur: number }): Promise<void> {
  const chArg = requireChannel(argv.ch)
  const dur = requireDuration(argv.dur)
  const net = requireMt32Target(argv)
  const out = new UdpMidiOutput(net.host, net.port)
  const ch = chArg - 1
  console.log(
    `net://${net.host}:${net.port}: MT-32 test note, ch${chArg} for ${dur}s ` +
      '(MT-32 mode only sounds on melodic channels 2-9 — channel 1 is silent)',
  )
  out.send('noteon', { note: 60, velocity: 100, channel: ch })
  await sleep(dur * 1000)
  out.send('noteoff', { note: 60, velocity: 0, channel: ch })
  out.close()
}
