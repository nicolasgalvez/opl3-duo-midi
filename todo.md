# Repeat & shuffle controls

## Engine

- [x] Default: no repeat (stop at end of playlist)
- [x] `repeat` loops playlist; `shuffle` randomizes play order
- [x] Disable both for headless render sessions

## CLI (`opl serve`)

- [x] `--repeat` / `--loop` and `--shuffle` flags
- [x] `OPL_REPEAT` / `OPL_SHUFFLE` env vars

## Web UI

- [x] Repeat and shuffle toggle buttons in transport
- [x] Reflect state from SSE; post toggles to `/api`

## Tests (TDD)

- [x] `tests/playback.test.mjs` — next-index logic
- [x] `tests/web.spec.mjs` — toggle buttons + API

## Ship

- [x] Commit and push
