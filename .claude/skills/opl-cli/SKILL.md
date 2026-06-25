---
name: opl-cli
description: >-
  Drive and test the OPL3 Duo synth over USB-MIDI with the `opl` CLI (tools/midi/opl.mjs):
  list ports, play notes/chords/scales, send program changes and control changes, play
  Standard MIDI Files or folders, serve the web visualizer, and panic stuck notes.
  Use whenever the user wants to test the synth, send MIDI, hear a patch, play a .mid file,
  or open the visualizer — e.g. "play middle C", "test patch 24", "send CC10", "play this song",
  "is the synth working", "serve the player", "kill the stuck note".
---

# opl-cli — drive the synth over MIDI

`opl` is the project's Node CLI (`tools/midi/opl.mjs`). Use it to test the firmware end-to-end:
it sends USB-MIDI to the **OPL3Duo MIDI** device, and the synth plays through the board's
**stereo line-out**.

## Critical: where the sound comes out

Audio is **analog line-out on the OPL3 Duo board, NOT over USB.** If the user "hears nothing,"
the first thing to check is whether speakers/an interface are plugged into the board's line-out
jack — the firmware and CLI can be working perfectly with silence over USB. Don't assume a bug.

## Setup (once)

From the repo root:

```bash
npm install && npm link   # makes `opl` global (bin -> tools/midi/opl.mjs)
```

If `opl` isn't on PATH, run it directly: `node tools/midi/opl.mjs <cmd>`.
Always run `opl list` first to confirm the device is connected and named as expected.

## Command reference

```bash
opl list                       # list MIDI output ports — run this first
opl note 60                    # play a note (60 = middle C); --vel --dur --ch
opl chord 60 64 67             # play notes together; --vel --dur --ch
opl scale --root 60            # play a scale up from root; --vel --dur --ch
opl pc 24                      # program change to GM patch 24 (nylon guitar); --ch
opl cc 10 0                    # any control change: here pan hard-left; --ch
opl play song.mid              # play a Standard MIDI File
opl play "folder" -r --loop    # play a folder (recursive), looping
opl play song.mid --ch 1       # force every event onto one channel
opl serve "folder" -r          # web visualizer at http://localhost:7373 (see below)
opl panic                      # silence all stuck/hung notes
```

Global option: `--port <substr>` selects the output by name substring (default `OPL3Duo`).

### Channel alignment (common gotcha)

`pc`/`cc` and `note`/`chord`/`play` all default to **channel 1**. To audition a patch you must
send the program change and the notes on the **same channel**, e.g.:

```bash
opl pc 24 --ch 1 && opl note 60 --ch 1
```

MIDI **channel 10** is the GM drum kit — notes there play percussion, not the melodic patch.

### `opl play` transport (in a TTY)

While `play` runs in an interactive terminal: **n** = next, **p** = prev, **space** = pause,
**q** = quit. It panics between tracks and on every stop so notes can't hang.

### Playlists (`.m3u` / `.jspf`)

`play`, `serve`, and `render` accept a **playlist file** anywhere they accept a `.mid` or folder,
and the listed **track order is preserved** (shuffle/repeat stay opt-in):

- **`.m3u` / `.m3u8`** — plaintext, one path per line; `#` comments and `#EXTINF` lines ignored.
- **`.jspf`** (or `.json`) — [JSPF](https://www.xspf.org/jspf), the JSON form of XSPF:
  `{ "playlist": { "track": [ { "location": ["song.mid"] } ] } }`.

```bash
opl play set.m3u           # play in listed order
opl serve favorites.jspf   # serve a curated playlist in the web UI
```

Track paths resolve **relative to the playlist file's folder first**, then fall back to
`MIDI_LIBRARY`. Missing entries are skipped with a warning, not fatal. Parser/wiring live in
`tools/midi/lib/playlist.mjs` (expanded inside `collectFiles`, so all three commands get it).

### Web visualizer — `opl serve`

```bash
opl serve "folder" -r                 # serve a folder of .mid (recursive), open :7373
opl serve "folder" -r --http 8080     # different port
opl serve "folder" -r --layout minimized   # hide playlist, large scrolling title (video-friendly)
opl serve "folder" -r --layout overlay      # transparent background for an OBS browser source
opl serve "folder" -r --repeat --shuffle    # loop the playlist in random order
opl serve "folder" -r --theme winamp        # metallic LCD theme (default "green" CRT)
```

Node owns playback; pick the **output device** in the page (top-right) and press play.
A 16-channel velocity equalizer is fed live over Server-Sent Events. `Ctrl-C` stops the server.

## `.env` defaults (`tools/midi/.env`)

Copy `tools/midi/.env.example` to `tools/midi/.env`. Relevant to playback:

- `MIDI_LIBRARY` — base path; **relative** folder/file args to `serve`/`play` resolve against it
  when not found in the cwd (`opl serve "_Bobby Prince" -r`).
- `OPL_THEME`, `OPL_TITLE`, `OPL_LAYOUT`, `OPL_REPEAT`, `OPL_SHUFFLE` — visualizer defaults.

## If something doesn't sound right

1. `opl list` — is **OPL3Duo MIDI** present? If not, the firmware isn't flashed/running.
2. Line-out connected to speakers/interface? (audio is **not** over USB — see top).
3. Same channel for `pc` and `note`? Channel 10 is drums.
4. Stuck note? `opl panic`.
5. SMF (`@tonejs/midi`) is flattened to a ~4ms event scheduler; `--ch` collapses everything
   onto one channel if a multi-channel file is muddy.

For the render-to-video workflow, use the **render-video** skill instead.
