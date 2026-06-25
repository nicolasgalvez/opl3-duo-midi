# OPL3 Duo MIDI Synth (Teensy 4.1)

A USB-MIDI FM synthesizer firmware for the [OPL3 Duo!](https://www.cheerful.nl) board
(dual Yamaha YMF262 / OPL3 chips) driven by a **Teensy 4.1** over hardware SPI, built on the
[ArduinoOPL2](https://github.com/DhrBaksteen/ArduinoOPL2) library.

Plug it into a computer and it shows up as a MIDI device named **`OPL3Duo MIDI`** — play it
from a DAW (Ableton, etc.) or from the included `opl` command-line tool. Audio comes out of the
board's stereo line-out.

## Features

- **General MIDI** — 128 4-operator instrument patches + GM drum kit (MIDI channel 10)
- **16-channel multitimbral**, up to 12 melodic 4-op voices + 12 drum voices across both chips
- **Control changes**: volume (CC7), expression (CC11), pan (CC10, L/C/R), sustain (CC64),
  modulation (CC1), pitch bend, aftertouch, and the panic CCs (120/121/123)
- **Rotary encoder** support to change the patch live (+ optional SSD1306 OLED), all configurable
  in `src/Config.h`
- A clean OOP firmware structure that never blocks the MIDI loop

## Hardware / wiring

The board has no microcontroller of its own — the Teensy clocks it over SPI:

| Teensy 4.1 | OPL3 Duo! |              |
| ---------- | --------- | ------------ |
| 3.3V       | +3.3V     |              |
| GND        | GND       |              |
| D6         | A2        | unit select  |
| D7         | A1        | bank select  |
| D8         | A0        | address      |
| D9         | /IC       | reset        |
| D10        | /WR       | latch        |
| D11 (MOSI) | MOSI      | hardware SPI |
| D13 (SCK)  | SCK       | hardware SPI |

These match the library's default OPL3Duo pins; change them in `src/Config.h` if you wire it
differently.

## Build & flash

Requires [PlatformIO](https://platformio.org/).

```bash
pio run            # build
pio run -t upload  # build + flash (press the Teensy PROGRAM button if it doesn't auto-reboot)
```

The USB type is set to MIDI via `-D USB_MIDI_SERIAL` in `platformio.ini`.

## The `opl` CLI

A small Node tool (in `tools/midi/`) for testing and playback over MIDI.

```bash
npm install && npm link   # from repo root — makes `opl` global
opl list                                   # list MIDI outputs
opl note 60                                # middle C
opl pc 24                                  # program change (GM patch)
opl cc 10 0                                # any control change (here: pan left)
opl play song.mid                          # play a Standard MIDI File
opl play "/path/to/folder" -r --loop       # play a folder; n/p/space/q to control
opl serve "<folder>" -r                    # web visualizer (below)
opl serve "<folder>" -r --layout minimized # hide playlist, large scrolling title
opl serve "<folder>" -r --layout overlay   # transparent OBS overlay
opl render song.mid                        # headless video render (below)
opl panic                                  # silence stuck notes
```

### Playlists

`opl play`, `opl serve`, and `opl render` accept **playlist files** anywhere they accept a
`.mid` file or folder. Two standard formats are supported, and the playlist's **track order is
preserved** (shuffle/repeat stay opt-in):

- **`.m3u` / `.m3u8`** — the de-facto plaintext format (one path per line; `#` comments and
  `#EXTINF` lines are ignored). Read/written by VLC, foobar2000, Winamp, etc.
- **`.jspf`** (and `.json`) — [JSPF](https://www.xspf.org/jspf), the JSON form of the open
  **XSPF** standard: `{ "playlist": { "track": [ { "location": ["song.mid"] }, … ] } }`.

```bash
opl play set.m3u                 # play tracks in the order listed
opl play favorites.jspf          # JSPF works the same way
opl serve playlist.m3u           # serve a curated playlist in the web UI
opl render album.jspf -o out.mp4 # render a playlist to video (album mode also works)
```

Track paths inside a playlist resolve **relative to the playlist file's own folder** first, then
fall back to `MIDI_LIBRARY` (below). Entries that can't be found are skipped with a warning rather
than aborting the playlist.

### Web player + visualizer

```bash
opl serve "<folder>" -r            # serve a folder of .mid files (recursive)
# then open http://localhost:7373
opl serve "<folder>" -r --http 8080   # use a different port
opl serve "<folder>" -r --layout minimized   # video-friendly: no playlist, large title
opl serve "<folder>" -r --layout overlay     # OBS browser source (transparent bg)
opl serve "<folder>" -r --repeat --shuffle   # loop playlist, random order
```

Set `OPL_LAYOUT=minimized|overlay` in `.env` (repo root or `tools/midi/.env`).

An ANSI/CRT-themed page with a 16-channel velocity **equalizer**, playlist, now-playing
(track + folder), and transport. Pick the MIDI **output device** in the page (top-right) and
press play. `Ctrl-C` stops the server.

#### Web Player v2 (React SPA) — the default UI

The player UI is a Vite + React + Zustand SPA with a desktop-style **File / Edit / View** menu
bar, drag-free playlist reordering (▲ ▼ ✕ per row), Open/Save dialogs, and persisted
theme/layout/panel state — on top of the same live SSE equalizer and transport. It supports the
`normal`/`minimized`/`overlay` layouts at parity with the renderer.

```bash
cd tools/midi/web-app && npm install   # one-time: install the SPA's deps
opl serve "<folder>" -r                # v2 by default (auto-builds the bundle on first run)
opl serve "<folder>" -r --ui classic   # opt back to the legacy static page (or OPL_UI=classic)
```

If the SPA can't be built (its deps aren't installed) `opl serve` falls back to the classic page.
The headless renderer always uses the classic `render.html`.

#### Config + feature flags (embeddable player)

`opl serve` takes a JSON config (validated; invalid config is a clear fatal error) that sets
defaults and toggles features — so the same app runs as the full tool or a stripped-down
**player-only widget**. v2 is selected automatically when the config needs it.

```bash
opl serve "<folder>" -r --preset player-only   # SoundFont output, no menu/upload/edit
opl serve "<folder>" -r --config ./opl.json    # custom config file (or OPL_CONFIG=...)
```

`opl.json` keys (all optional): `title`, `theme` (`green`/`winamp`), `layout`
(`normal`/`minimized`/`overlay`), `output` (`hardware`/`soundfont`), and
`features` (`menu`, `playlist`, `library`, `edit`, `devicePicker`, `outputPicker` booleans).
A file may also set `"preset": "player-only"` and override individual keys. The SPA reads the
config from `GET /api/config`. Embed the widget with an iframe pointing at the server:

```html
<iframe src="http://localhost:7373" width="480" height="320"></iframe>
```

**SoundFont output (v2):** the **Output** selector (top-right) switches between the hardware OPL3
synth and an **in-browser SoundFont** engine ([spessasynth](https://github.com/spessasus/spessasynth_lib),
WebAudio) — so the player makes sound with no hardware attached. A built-in default SoundFont
works out of the box; load your own `.sf2` with the **SF2…** button. The 16-channel equalizer is
driven by the synth's note events in this mode.

**Media library (v2):** View ▸ Toggle Library opens a persistent library panel — drag `.mid`
files onto it (or click to add), search by name/folder, play, or remove. Uploaded files are
stored **content-addressed** (identical bytes are never duplicated) and the library is a small
JSON DB ([lowdb](https://github.com/typicode/lowdb)) of **paths + metadata only** (never copies),
so it survives restarts. Locations: `OPL_LIBRARY_DB` (default `tools/midi/.opl-library.json`) and
`OPL_UPLOADS_DIR` (default `tools/midi/.opl-uploads/`).

### Headless video renderer (`opl render`)

Renders a MIDI file to a video file — plays the synth, records the audio from a
system input device (BlackHole, ALSA, JACK, etc.), and captures the web visualizer
via headless Playwright. The result is an H.264 MP4 ready for YouTube or social media.

```bash
# List available audio input devices
opl render --list-audio

# Basic render (uses OPL_AUDIO_DEVICE / OPL_MIDI_DEVICE from .env)
opl render song.mid

# Override audio device explicitly
opl render song.mid --audio-device "BlackHole 2ch"

# Vertical (Shorts/Reels/TikTok)
opl render song.mid --platform youtube --aspect portrait
opl render song.mid --ratio 9:16   # legacy preset

# Instagram
opl render song.mid --platform instagram --aspect square
opl render song.mid --platform instagram --aspect story

# Minimized layout for cleaner videos
opl render song.mid --layout minimized --platform youtube --aspect landscape

# Render via OBS (video from OBS, audio still captured cleanly via RtAudio)
opl render song.mid --obs --obs-source "OPL Visualizer"
# Set OPL_OBS_URL, OPL_OBS_PASSWORD, OPL_OBS_SOURCE in .env as needed

# If video leads audio (common with OBS), tweak sync at mux time:
opl render song.mid --obs --av-offset 200    # delay audio 200ms
opl render song.mid --av-offset -100         # delay video 100ms (any render mode)

# With album art and custom output
opl render song.mid --art cover.png -o video.mp4

# Custom resolution + tail duration
opl render song.mid --resolution 1920x1080 --tail 5

# Batch: render every .mid in a folder as a separate video
opl render "folder/" -r

# Album: render all tracks in a folder as one continuous video
opl render "folder/" --album -o doom-soundtrack.mp4

# Instagram square
opl render song.mid --ratio 1:1
```

Platform presets (use `--platform` with `--aspect`; override with `--resolution`):

| Platform    | Aspect      | Resolution         |
| ----------- | ----------- | ------------------ |
| `youtube`   | `landscape` | 1920×1080          |
| `youtube`   | `portrait`  | 1080×1920 (Shorts) |
| `instagram` | `square`    | 1080×1080          |
| `instagram` | `portrait`  | 1080×1350 (feed)   |
| `instagram` | `story`     | 1080×1920 (Reels)  |

Set `OPL_PLATFORM` / `OPL_ASPECT` / `OPL_LAYOUT` in `.env`.

Options:

| Flag                    | Default                 | Description                                            |
| ----------------------- | ----------------------- | ------------------------------------------------------ |
| `--audio-device <name>` | `OPL_AUDIO_DEVICE` env  | Audio input device (BlackHole 2ch, default, hw:1,0, …) |
| `--ratio <preset>`      | `16:9`                  | Legacy aspect ratio: `16:9`, `9:16`, `1:1`, `4:5`      |
| `--platform`            | —                       | `youtube` or `instagram` (use with `--aspect`)         |
| `--aspect`              | —                       | `landscape`, `portrait`, `square`, `story`             |
| `--layout`              | `normal`                | `normal`, `minimized`, or `overlay`                    |
| `--obs`                 | off                     | Capture video from OBS WebSocket instead of Playwright |
| `--obs-source`          | `OPL_OBS_SOURCE`        | OBS browser source name to auto-point at visualizer    |
| `--obs-url`             | `ws://127.0.0.1:4455`   | OBS WebSocket URL (`OPL_OBS_URL`)                      |
| `--obs-password`        | `OPL_OBS_PASSWORD`      | OBS WebSocket password                                 |
| `--av-offset <ms>`      | `OPL_AV_OFFSET`         | Sync tweak at mux: + delays audio, − delays video      |
| `--resolution WxH`      | _(from ratio/platform)_ | Custom resolution (overrides presets)                  |
| `-o, --output <path>`   | auto                    | Output `.mp4` file path                                |
| `--art <path>`          | _(none)_                | Album art image to overlay                             |
| `--tail <seconds>`      | `3`                     | Recording tail after last MIDI note                    |
| `--fps <n>`             | `30`                    | Output video framerate                                 |
| `--device <name>`       | `OPL_MIDI_DEVICE` env   | MIDI output device substring (auto-detects if unset)   |
| `--keep-temps`          | off                     | Keep intermediate WebM/WAV files                       |
| `--list-audio`          | —                       | List audio devices and exit                            |

**How it works:** The command starts an internal web server with the visualizer,
launches a headless Chromium browser (Playwright), records audio via `ffmpeg` from
the specified input device, plays the MIDI file to the synth, then muxes the video
and audio into the final MP4.

**Prerequisites:** `ffmpeg` must be installed. Playwright is included in
`tools/midi/package.json` — run `npm install` in `tools/midi/` if needed.

**Audio routing:** The OPL3 board outputs analog audio from its line-out jack. To
capture it, route the line-out into your computer's audio interface and use a
loopback device (BlackHole on macOS, PulseAudio monitor source on Linux) or an
aggregate device that includes the interface input.

### MIDI library base path + device defaults (`.env`)

Copy `tools/midi/.env.example` to `tools/midi/.env` and set:

```bash
# Base path to your MIDI collection. Relative `opl serve` / `opl play` paths
# resolve against this when not found in the cwd.
MIDI_LIBRARY=/path/to/midi/collection

# Default audio input device for `opl render` (ffmpeg AVFoundation/ALSA name).
# Run `opl render --list-audio` to see available devices.
OPL_AUDIO_DEVICE=BlackHole 2ch

# Default MIDI output device for `opl render` (substring match).
# Leave unset to auto-detect (prefers "OPL3Duo", falls back to first port).
OPL_MIDI_DEVICE=Clarett 4Pre MIDI
```

Then **relative** folder names passed to `opl serve` / `opl play` resolve against
`MIDI_LIBRARY`:

```bash
# with MIDI_LIBRARY=/path/to/collection
opl serve "_Bobby Prince" -r       # -> /path/to/collection/_Bobby Prince
opl render "_Bobby Prince/song.mid" # -> renders that track using .env device defaults
```

## Project layout

```
src/
  Config.h            pins + options (encoder/OLED toggles)
  OplSynth.{h,cpp}    synth engine: OPL3Duo + voice allocation + MIDI handling
  PatchEncoder.{h,cpp}  rotary encoder + debounced button
  PatchDisplay.{h,cpp}  SSD1306 patch-name display (compile-time toggle)
  GMNames.h           General MIDI instrument names
  main.cpp            composition root + usbMIDI handlers
tools/midi/           the `opl` CLI (Node + yargs + easymidi + @tonejs/midi)
```

## Formatting & linting

A pre-commit hook formats only the files you've staged — **clang-format** for
C/C++ firmware and **ESLint + Prettier** for the `tools/midi` CLI. Install it
once with `npm install` at the repo root (also `brew install clang-format`).

```bash
npm install            # installs husky hooks + JS formatters (repo root)
npm run format         # one-off: format the whole repo (C/C++ and JS)
```

The hook runs automatically on `git commit`; bypass with `--no-verify` if ever
needed.

## Credits

- [ArduinoOPL2](https://github.com/DhrBaksteen/ArduinoOPL2) and the OPL3 Duo! board by Maarten Janssen / Cheerful Electronic
- The MIDI synth engine builds on that library's `OPL3Duo/TeensyMidi` example
