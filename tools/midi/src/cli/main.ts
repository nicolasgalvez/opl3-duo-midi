/**
 * opl — one CLI for the OPL3 Duo USB-MIDI synth.
 *
 * Owns a single MIDI connection (easymidi -> CoreMIDI), always pairs note-on with
 * note-off, and panics on every stop so notes can't hang.
 *
 *   opl list
 *   opl note 60 --vel 100 --dur 1 --ch 1
 *   opl chord 60 64 67
 *   opl scale
 *   opl pc 24                 # program change (prints GM name)
 *   opl cc 10 0               # control change (here: pan hard-left)
 *   opl panic
 *   opl play song.mid
 *   opl play "/a/folder" -r --shuffle --loop
 *
 * During `play` in a terminal:  n = next   p = prev   space = pause   q = quit
 */
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { DEFAULT_MIDI_UDP_PORT } from '../contracts/net.ts'
import { MT32_ROM_SETS, MT32_SYNTHS, MT32_DEFAULT_TEST_CHANNEL } from '../core/mt32pi.ts'
import { loadEnv } from '../adapters/fs/paths.ts'
import { applyRenderOptions } from './renderOptions.ts'
import {
  cmdList,
  cmdNote,
  cmdChord,
  cmdScale,
  cmdPc,
  cmdCc,
  cmdPanic,
  type NoteArgv,
  type ChordArgv,
  type ScaleArgv,
  type PcArgv,
  type CcArgv,
} from './commands/basic.ts'
import {
  addMt32FtpOptions,
  cmdMt32Reboot,
  cmdMt32Rom,
  cmdMt32Synth,
  cmdMt32Stereo,
  cmdMt32SoundFonts,
  cmdMt32SoundFont,
  cmdMt32Upload,
  cmdMt32Test,
  type Mt32FtpArgv,
} from './commands/mt32.ts'
import { cmdPlay, type PlayArgv } from './commands/play.ts'
import { cmdServe, type ServeArgv } from './commands/serve.ts'
import { cmdRender, type RenderArgv } from './commands/render.ts'
import {
  cmdQueueAdd,
  cmdQueueList,
  cmdQueueRemove,
  cmdQueueClear,
  cmdQueueStop,
  cmdQueueRun,
  type QueueAddArgv,
} from './commands/queue.ts'
import type { GlobalArgv } from './shared.ts'

loadEnv()

yargs(hideBin(process.argv))
  .scriptName('opl')
  .usage('$0 <command> [options]')
  .option('port', { type: 'string', describe: 'output port name substring (default: OPL3Duo)' })
  .option('host', {
    type: 'string',
    describe: 'send MIDI over UDP to this network host instead of USB (e.g. an mt32-pi; or OPL_MIDI_HOST)',
  })
  .option('net-port', {
    type: 'number',
    describe: `UDP port for --host (default ${DEFAULT_MIDI_UDP_PORT}; or OPL_MIDI_PORT)`,
  })
  .command('list', 'list MIDI output ports', () => {}, cmdList)
  .command(
    'note <note>',
    'play a single note',
    (y) =>
      y
        .positional('note', { type: 'number', describe: 'MIDI note (60 = middle C)' })
        .option('vel', { type: 'number', default: 100 })
        .option('dur', { type: 'number', default: 0.5, describe: 'seconds' })
        .option('ch', { type: 'number', default: 1, describe: 'MIDI channel 1-16' }),
    (argv) => cmdNote(argv as unknown as NoteArgv),
  )
  .command(
    'chord <notes..>',
    'play notes together',
    (y) =>
      y
        .positional('notes', { type: 'number' })
        .option('vel', { type: 'number', default: 100 })
        .option('dur', { type: 'number', default: 1 })
        .option('ch', { type: 'number', default: 1 }),
    (argv) => cmdChord(argv as unknown as ChordArgv),
  )
  .command(
    'scale',
    'play a major scale',
    (y) =>
      y
        .option('root', { type: 'number', default: 60 })
        .option('vel', { type: 'number', default: 100 })
        .option('dur', { type: 'number', default: 0.25 })
        .option('ch', { type: 'number', default: 1 }),
    (argv) => cmdScale(argv as unknown as ScaleArgv),
  )
  .command(
    'pc <program>',
    'program change (GM patch 0-127)',
    (y) => y.positional('program', { type: 'number' }).option('ch', { type: 'number', default: 1 }),
    (argv) => cmdPc(argv as unknown as PcArgv),
  )
  .command(
    'cc <number> <value>',
    'send a control change',
    (y) =>
      y
        .positional('number', { type: 'number', describe: 'CC number 0-127' })
        .positional('value', { type: 'number', describe: 'value 0-127' })
        .option('ch', { type: 'number', default: 1 }),
    (argv) => cmdCc(argv as unknown as CcArgv),
  )
  .command('panic', 'silence all stuck notes', () => {}, (argv) => cmdPanic(argv as GlobalArgv))
  .command(
    'play <paths..>',
    'play .mid file(s) or folder(s)',
    (y) =>
      y
        .positional('paths', { type: 'string' })
        .option('recursive', { alias: 'r', type: 'boolean', default: false })
        .option('shuffle', { type: 'boolean', default: false })
        .option('loop', { type: 'boolean', default: false })
        .option('ch', { type: 'number', describe: 'force all events onto this channel 1-16' }),
    (argv) => cmdPlay(argv as unknown as PlayArgv),
  )
  .command(
    'serve [folder]',
    'web player + visualizer; pick any MIDI output device',
    (y) =>
      y
        .positional('folder', { type: 'string', describe: 'folder of .mid files (default: current dir)' })
        .option('recursive', { alias: 'r', type: 'boolean', default: false })
        .option('http', { type: 'number', default: 7373, describe: 'HTTP port for the web UI' })
        .option('theme', { type: 'string', describe: 'web theme: green (default) or winamp' })
        .option('title', { type: 'string', describe: 'app title shown in the UI (default "OPL · MIDI PLAYER")' })
        .option('layout', {
          type: 'string',
          choices: ['normal', 'minimized', 'overlay'],
          describe: 'display layout: normal, minimized (hide playlist, large title), or overlay (OBS transparent)',
        })
        .option('repeat', {
          alias: 'loop',
          type: 'boolean',
          default: false,
          describe: 'loop playlist when a track ends',
        })
        .option('shuffle', { type: 'boolean', default: false, describe: 'shuffle play order' })
        .option('ui', {
          type: 'string',
          choices: ['classic', 'v2'],
          describe: 'web UI: v2 React SPA (default) or classic legacy page (or OPL_UI)',
        })
        .option('preset', {
          type: 'string',
          choices: ['full', 'player-only'],
          describe: 'config preset; player-only = embeddable widget (SoundFont, no menu/upload/edit)',
        })
        .option('config', {
          type: 'string',
          describe: 'path to a JSON config file (feature flags + defaults; or a preset name; or OPL_CONFIG)',
        }),
    (argv) => cmdServe(argv as unknown as ServeArgv),
  )
  .command(
    'render [paths..]',
    'render MIDI file(s) or folder to video (headless)',
    (y) => applyRenderOptions(y.positional('paths', { type: 'string', describe: '.mid file(s) or folder(s)' })),
    (argv) => cmdRender(argv as unknown as RenderArgv),
  )
  .command(
    'queue <subcommand>',
    'queue up render jobs (JSON-backed) to run sequentially, one at a time',
    (y) =>
      y
        .command(
          'add [paths..]',
          'add a render job to the queue (accepts every `opl render` option)',
          (yy) => applyRenderOptions(yy.positional('paths', { type: 'string', describe: '.mid file(s) or folder(s)' })),
          (argv) => cmdQueueAdd(argv as unknown as QueueAddArgv & Record<string, unknown>),
        )
        .command('list', 'list queued jobs', () => {}, cmdQueueList)
        .command(
          'remove <id>',
          'remove a queued job by id',
          (yy) => yy.positional('id', { type: 'number', describe: 'job id, from `opl queue list`' }),
          (argv) => cmdQueueRemove(argv as unknown as { id: number }),
        )
        .command('clear', 'remove every queued job, regardless of status', () => {}, cmdQueueClear)
        .command(
          'run',
          'process pending jobs one at a time, spawning `opl render` for each',
          (yy) =>
            yy.option('watch', {
              type: 'boolean',
              default: false,
              describe: 'keep polling for newly-added jobs instead of exiting once the queue is empty',
            }),
          (argv) => cmdQueueRun(argv as unknown as { watch: boolean }),
        )
        .command(
          'stop',
          'stop the currently-running `opl queue run` (cleanly: resets the chip, stops OBS)',
          () => {},
          cmdQueueStop,
        )
        .demandCommand(1, 'Pick a queue subcommand (try --help).'),
    () => {},
  )
  .command(
    'mt32 <subcommand>',
    'mt32-pi device control (custom SysEx + FTP SoundFont management)',
    (y) =>
      y
        .command('reboot', 'reboot the mt32-pi', () => {}, (argv) => cmdMt32Reboot(argv as GlobalArgv))
        .command(
          'rom <romSet>',
          'switch MT-32 ROM set',
          (yy) => yy.positional('romSet', { type: 'string', choices: Object.keys(MT32_ROM_SETS) }),
          (argv) => cmdMt32Rom(argv as unknown as GlobalArgv & { romSet: string }),
        )
        .command(
          'synth <synth>',
          'switch synth mode (mt32 or soundfont)',
          (yy) => yy.positional('synth', { type: 'string', choices: Object.keys(MT32_SYNTHS) }),
          (argv) => cmdMt32Synth(argv as unknown as GlobalArgv & { synth: string }),
        )
        .command(
          'stereo <state>',
          'set reversed stereo output',
          (yy) => yy.positional('state', { type: 'string', choices: ['on', 'off'] }),
          (argv) => cmdMt32Stereo(argv as unknown as GlobalArgv & { state: string }),
        )
        .command(
          'soundfonts',
          "list SoundFonts on the device's storage (via FTP)",
          addMt32FtpOptions,
          (argv) => cmdMt32SoundFonts(argv as unknown as Mt32FtpArgv),
        )
        .command(
          'soundfont <nameOrIndex>',
          'switch SoundFont by name (substring match) or index',
          (yy) => addMt32FtpOptions(yy.positional('nameOrIndex', { type: 'string' })),
          (argv) => cmdMt32SoundFont(argv as unknown as Mt32FtpArgv & { nameOrIndex: string }),
        )
        .command(
          'upload <file>',
          'upload a .sf2/.sf3 SoundFont file to the device (via FTP)',
          (yy) => addMt32FtpOptions(yy.positional('file', { type: 'string' })),
          (argv) => cmdMt32Upload(argv as unknown as Mt32FtpArgv & { file: string }),
        )
        .command(
          'test',
          'send a quick test note (defaults to MT-32 channel 2 — channel 1 is silent in MT-32 mode)',
          (yy) =>
            yy
              .option('ch', {
                type: 'number',
                default: MT32_DEFAULT_TEST_CHANNEL,
                describe: 'MIDI channel 1-16 (MT-32 melodic parts live on channels 2-9)',
              })
              .option('dur', { type: 'number', default: 1, describe: 'seconds' }),
          (argv) => cmdMt32Test(argv as unknown as GlobalArgv & { ch: number; dur: number }),
        )
        .demandCommand(1, 'Pick an mt32 subcommand (try --help).'),
    () => {},
  )
  .demandCommand(1, 'Pick a command (try --help).')
  .strict()
  .help()
  .alias('h', 'help')
  .parse()
