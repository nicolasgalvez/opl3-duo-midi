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
cd tools/midi && npm install && npm link   # makes `opl` global
opl list                                   # list MIDI outputs
opl note 60                                # middle C
opl pc 24                                  # program change (GM patch)
opl cc 10 0                                # any control change (here: pan left)
opl play song.mid                          # play a Standard MIDI File
opl play "/path/to/folder" -r --loop       # play a folder; n/p/space/q to control
opl serve "<folder>" -r                    # web visualizer (below)
opl render song.mid                        # headless video render (below)
opl panic                                  # silence stuck notes
```

### Web player + visualizer

```bash
opl serve "<folder>" -r            # serve a folder of .mid files (recursive)
# then open http://localhost:7373
opl serve "<folder>" -r --http 8080   # use a different port
```

An ANSI/CRT-themed page with a 16-channel velocity **equalizer**, playlist, now-playing
(track + folder), and transport. Pick the MIDI **output device** in the page (top-right) and
press play. `Ctrl-C` stops the server.

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
opl render song.mid --ratio 9:16

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

Options:

| Flag | Default | Description |
|---|---|---|
| `--audio-device <name>` | `OPL_AUDIO_DEVICE` env | Audio input device (BlackHole 2ch, default, hw:1,0, …) |
| `--ratio <preset>` | `16:9` | Aspect ratio: `16:9`, `9:16`, `1:1`, `4:5` |
| `--resolution WxH` | *(from ratio)* | Custom resolution (overrides `--ratio`) |
| `-o, --output <path>` | auto | Output `.mp4` file path |
| `--art <path>` | *(none)* | Album art image to overlay |
| `--tail <seconds>` | `3` | Recording tail after last MIDI note |
| `--fps <n>` | `30` | Output video framerate |
| `--device <name>` | `OPL_MIDI_DEVICE` env | MIDI output device substring (auto-detects if unset) |
| `--keep-temps` | off | Keep intermediate WebM/WAV files |
| `--list-audio` | — | List audio devices and exit |

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
