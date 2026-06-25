---
name: render-video
description: >-
  Render a MIDI file (or folder) to an H.264 MP4 with the OPL3 synth using `opl render`:
  it plays the synth, captures the board's analog audio from a loopback/input device, records
  the web visualizer (headless Playwright or a live OBS session), and muxes them to video sized
  for YouTube/Instagram. Use when the user wants to record, render, export, or make a video of a
  song/playlist, produce a Shorts/Reels/square clip, fix A/V sync on a render, or list audio
  input devices.
---

# render-video — MIDI → MP4 with the OPL3 synth

`opl render` produces a finished `.mp4`: it plays the MIDI to the **OPL3Duo MIDI** device,
records the board's **analog line-out** audio via ffmpeg from an input/loopback device, captures
the web visualizer, and muxes audio+video. Output is H.264, ready for upload.

## Prerequisites (check these first)

- **ffmpeg** installed (`ffmpeg -version`). Required for capture + mux.
- **Playwright** browser available — `npm install` in `tools/midi/` if a render fails to launch
  Chromium. (Not needed when using `--obs`.)
- **Audio routing**: the OPL3 board emits analog audio from its line-out jack. To record it you
  must route line-out into an input the computer can capture — a loopback device (BlackHole on
  macOS, a PulseAudio monitor on Linux) or an audio interface input. Without this, the video has
  **no sound**. Confirm the device with:

```bash
opl render --list-audio    # list input devices + their channel counts, then exit
```

## Configure once (`tools/midi/.env`)

Copy `tools/midi/.env.example` to `tools/midi/.env`. Render reads these defaults:

- `OPL_AUDIO_DEVICE` — input/loopback device name (substring), e.g. `BlackHole 2ch`, `Clarett 4Pre`.
- `OPL_AUDIO_CHANNELS` — capture one stereo pair from a multi-channel interface, 1-based, e.g. `5,6`.
- `OPL_AUDIO_RATE` — sample rate (default `48000`; match the interface, e.g. `44100`).
- `OPL_MIDI_DEVICE` — output device substring (unset = auto-detect, prefers `OPL3Duo`).
- `OPL_PLATFORM`, `OPL_ASPECT`, `OPL_LAYOUT`, `OPL_THEME`, `OPL_TITLE` — video presets/branding.
- `OPL_OBS_URL`, `OPL_OBS_PASSWORD`, `OPL_OBS_SOURCE`, `OPL_AV_OFFSET` — OBS + sync defaults.

With `MIDI_LIBRARY` set, **relative** paths resolve against it (`opl render "_Bobby Prince/song.mid"`).

## Common renders

```bash
opl render song.mid                       # uses .env audio/MIDI device defaults
opl render song.mid --audio-device "BlackHole 2ch"
opl render "folder/" -r                    # batch: one MP4 per .mid in the folder
opl render "folder/" --album -o album.mp4  # all tracks as one continuous video
opl render song.mid -o out.mp4 --tail 5    # 5s of tail after the last note (default 3)
opl render song.mid --resolution 1920x1080 # custom WxH (overrides presets)
```

## Sizing for a platform

Use `--platform` with `--aspect` (or the legacy `--ratio`). `--resolution` overrides everything.

| Platform / flag                          | Result                |
| ---------------------------------------- | --------------------- |
| `--platform youtube --aspect landscape`  | 1920×1080             |
| `--platform youtube --aspect portrait`   | 1080×1920 (Shorts)    |
| `--platform instagram --aspect square`   | 1080×1080             |
| `--platform instagram --aspect portrait` | 1080×1350 (feed)      |
| `--platform instagram --aspect story`    | 1080×1920 (Reels)     |
| `--ratio 16:9 \| 9:16 \| 1:1 \| 4:5`     | legacy aspect presets |

Visual options: `--layout normal|minimized|overlay`, `--theme green|winamp`,
`--title "..."`, `--art <image>`, `--fps <n>` (default 30).

## Capture mode: headless vs OBS

- **Default** — headless Chromium (Playwright) records the visualizer. Self-contained.
- **`--obs`** — capture from a **running OBS** session over WebSocket instead. Use when you want
  OBS scenes/effects in the frame. Point it with `--obs-url` (default `ws://127.0.0.1:4455`),
  `--obs-password`, and `--obs-source` (browser source to auto-aim at the visualizer).

## Fixing A/V sync

If audio leads or lags the video, nudge at mux time with `--av-offset <ms>`:
**positive delays the audio, negative delays the video**. Start small (±50–150 ms).

## Debugging a bad render

- **No audio in the MP4** → audio routing/loopback not set up, or wrong `--audio-device`
  / `OPL_AUDIO_CHANNELS`. Re-check with `--list-audio`. (The board's audio is **not** on USB.)
- **Browser won't launch** → `npm install` in `tools/midi/`, or use `--obs`.
- **Inspect intermediates** → `--keep-temps` keeps `video.webm` and `audio.wav`.
- **ffmpeg missing** → install it; nothing renders without it.

## How it works

Starts an internal server with the visualizer → launches headless Chromium (or attaches to OBS)
→ records audio via ffmpeg from the input device while playing the MIDI to the synth → muxes
video + audio into the final MP4. For interactive playback/testing instead of rendering, use the
**opl-cli** skill.
