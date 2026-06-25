# A/V offset for render

## CLI & env

- [x] `--av-offset <ms>` on `opl render` — delay audio (+) or video (−) at mux time
- [x] `OPL_AV_OFFSET` env var support
- [x] Document in README (especially useful with `--obs`)

## Implementation

- [x] Extract `resolveAvOffset` + `buildMuxArgs` to `lib/mux.mjs`
- [x] Wire into `muxVideoAudio` for both Playwright and OBS render paths

## Tests (TDD)

- [x] `tests/mux.test.mjs` — offset parsing and ffmpeg arg generation

## Ship

- [ ] Commit and push to PR branch
