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

### MIDI library base path (`.env`)

Copy `tools/midi/.env.example` to `tools/midi/.env` and set `MIDI_LIBRARY` to your MIDI
collection's path. Then **relative** folder names passed to `opl serve` / `opl play` resolve
against it:

```bash
# with MIDI_LIBRARY=/path/to/collection
opl serve "_Bobby Prince" -r       # -> /path/to/collection/_Bobby Prince
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
