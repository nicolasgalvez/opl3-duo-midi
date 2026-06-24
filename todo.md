# Display modes, platform presets, and root CLI

## Root CLI & npm link

- [x] Add `opl` bin to root `package.json` pointing at `tools/midi/opl.mjs`
- [x] Configure npm workspaces so `npm install` / `npm link` work from repo root
- [x] Load `.env` from repo root and `tools/midi/.env`
- [x] Update Playwright webServer to invoke CLI from repo root

## Display layout modes (`--layout` / `OPL_LAYOUT`)

- [x] **`minimized`** — hide playlist; larger song title with horizontal scroll when too long
- [x] **`overlay`** — transparent background; title at bottom with high-contrast outline; EQ as small square in corner (OBS)
- [x] Wire layout into `serve` and `render` CLI args
- [x] Support `OPL_LAYOUT` env var (minimized | overlay | normal)

## Platform dimension presets (`--platform` / `--aspect`)

- [x] YouTube: landscape 1920×1080, portrait 1080×1920 (Shorts)
- [x] Instagram: square 1080×1080, portrait 1080×1350 (feed), story 1080×1920 (Reels)
- [x] CLI: `--platform youtube|instagram`, `--aspect landscape|portrait|square|story`
- [x] Priority: `--resolution` > platform+aspect > legacy `--ratio`
- [x] Unit tests for preset resolution

## Web UI

- [x] Inject `data-layout` on served HTML (like `data-theme`)
- [x] CSS/JS for minimized and overlay layouts in `index.html`, `render.html`, `style.css`
- [x] Playwright tests for each layout mode

## Tests (red/green TDD)

- [x] `tests/layout.test.mjs` — layout arg/env parsing
- [x] `tests/presets.test.mjs` — platform/aspect dimension resolution
- [x] `tests/minimized.spec.mjs` — minimized UI behavior
- [x] `tests/overlay.spec.mjs` — overlay UI behavior

## PR

- [x] Branch `feat/display-modes-and-root-cli`
- [ ] Open PR when green
