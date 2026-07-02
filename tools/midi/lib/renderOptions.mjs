// Single source of truth for `opl render`'s CLI options, shared with
// `opl queue add` (identical flags) and the queue runner (which needs to
// turn a stored job's args back into CLI flags to spawn `opl render`).
//
// `global: true` marks options already registered as top-level yargs
// options (--host/--net-port) — applyRenderOptions() skips redeclaring
// those on a command builder, but extraction/serialization still cover them
// since a queued job needs to remember them too.
export const RENDER_OPTIONS = [
  { flag: 'recursive', alias: 'r', type: 'boolean', default: false, describe: 'recurse into subfolders' },
  { flag: 'album', type: 'boolean', default: false, describe: 'render all tracks as one continuous video' },
  { flag: 'audio-device', type: 'string', describe: 'audio input device name (use --list-audio to see)' },
  {
    flag: 'audio-channels',
    type: 'string',
    describe: 'capture only these two 1-based input channels as stereo, e.g. "7,8"',
  },
  {
    flag: 'audio-rate',
    type: 'number',
    describe: 'audio sample rate (default 48000; match your interface, e.g. 44100)',
  },
  { flag: 'output', alias: 'o', type: 'string', describe: 'output video file (.mp4)' },
  {
    flag: 'ratio',
    type: 'string',
    default: '16:9',
    choices: ['16:9', '9:16', '1:1', '4:5'],
    describe: 'aspect ratio preset (ignored when --platform/--aspect or --resolution is set)',
  },
  {
    flag: 'platform',
    type: 'string',
    choices: ['youtube', 'instagram'],
    describe: 'social video platform preset (use with --aspect)',
  },
  {
    flag: 'aspect',
    type: 'string',
    choices: ['landscape', 'portrait', 'square', 'story'],
    describe: 'platform aspect: youtube landscape/portrait; instagram square/portrait/story',
  },
  { flag: 'resolution', type: 'string', describe: 'custom resolution WxH (overrides --platform/--aspect and --ratio)' },
  { flag: 'art', type: 'string', describe: 'path to album art image' },
  { flag: 'tail', type: 'number', default: 3, describe: 'seconds of tail after last note (default: 3)' },
  { flag: 'device', type: 'string', describe: 'MIDI output device name substring' },
  { flag: 'port', type: 'number', describe: 'HTTP port for internal server (default: random)' },
  { flag: 'fps', type: 'number', default: 30, describe: 'output video framerate' },
  { flag: 'keep-temps', type: 'boolean', default: false, describe: 'keep temp files (video.webm, audio.wav)' },
  { flag: 'list-audio', type: 'boolean', default: false, describe: 'list audio input devices and exit' },
  { flag: 'theme', type: 'string', describe: 'visualizer theme: green (default) or winamp' },
  { flag: 'title', type: 'string', describe: 'app title shown in the visualizer (default "OPL · MIDI PLAYER")' },
  {
    flag: 'layout',
    type: 'string',
    choices: ['normal', 'minimized', 'overlay'],
    describe: 'display layout: normal, minimized (hide playlist, large title), or overlay (OBS transparent)',
  },
  {
    flag: 'obs',
    type: 'boolean',
    default: false,
    describe: 'capture video from a running OBS session (WebSocket) instead of headless Playwright',
  },
  {
    flag: 'obs-url',
    type: 'string',
    describe: 'OBS WebSocket URL (default ws://127.0.0.1:4455, or OPL_OBS_URL in .env)',
  },
  { flag: 'obs-password', type: 'string', describe: 'OBS WebSocket password (or OPL_OBS_PASSWORD in .env)' },
  {
    flag: 'obs-source',
    type: 'string',
    describe: 'OBS browser source name to point at the visualizer (or OPL_OBS_SOURCE in .env)',
  },
  {
    flag: 'av-offset',
    type: 'number',
    describe: 'A/V sync tweak in ms at mux (+ delays audio, − delays video; or OPL_AV_OFFSET)',
  },
  {
    flag: 'browser-path',
    type: 'string',
    describe:
      "path to an installed Chromium/Chrome executable to drive instead of downloading one (or OPL_BROWSER_PATH). Use when Playwright's bundled browser won't launch on this OS (e.g. macOS < 14).",
  },
  { flag: 'host', type: 'string', global: true, describe: 'send MIDI over UDP to this network host instead of USB' },
  { flag: 'net-port', type: 'number', global: true, describe: 'UDP port for --host' },
]

function camelCase(kebab) {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

const OPTION_BY_KEY = Object.fromEntries(RENDER_OPTIONS.map((o) => [camelCase(o.flag), o]))

/** Apply every non-global render option to a yargs command builder. */
export function applyRenderOptions(y) {
  let yy = y
  for (const opt of RENDER_OPTIONS) {
    if (opt.global) continue
    const rest = { ...opt }
    delete rest.flag
    delete rest.global
    yy = yy.option(opt.flag, rest)
  }
  return yy
}

/** Pick just the known render options out of a parsed yargs argv (drops _, $0, paths, unknown keys). */
export function extractRenderArgs(argv) {
  const out = {}
  for (const opt of RENDER_OPTIONS) {
    const key = camelCase(opt.flag)
    if (argv[key] === undefined) continue
    out[key] = argv[key]
  }
  return out
}

/** Turn a stored args object back into CLI flag tokens for spawning `opl render`. */
export function serializeRenderArgs(args) {
  const tokens = []
  for (const [key, value] of Object.entries(args)) {
    const opt = OPTION_BY_KEY[key]
    if (!opt || value === undefined || value === null) continue
    if (opt.type === 'boolean') {
      if (value) tokens.push(`--${opt.flag}`)
      continue
    }
    tokens.push(`--${opt.flag}`, String(value))
  }
  return tokens
}
