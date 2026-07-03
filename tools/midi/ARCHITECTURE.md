# tools/midi architecture

TypeScript, hexagonal (ports & adapters). Every delivery mechanism — the CLI
today; an API, the web app, or an MCP server tomorrow — is a thin client of the
same core logic.

```
CLI ┐
API ├──> contracts ───> core ───> ports/interfaces
Web ┤                      ↑
MCP ┘                      │
                    infrastructure adapters
```

## Layers (`src/`)

| Directory       | Role                                                                                   | May import                 |
| --------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| `src/contracts` | zod schemas + inferred types shared by all clients (config, playlists, render options) | zod only                   |
| `src/core`      | Pure domain logic. No I/O: no fs, net, child_process, or hardware access               | `contracts`, `ports`       |
| `src/ports`     | Interfaces the core needs the outside world to fulfill (MIDI out, clock, storage)      | `contracts`                |
| `src/adapters`  | Infrastructure implementations of ports: easymidi, audify, lowdb, basic-ftp, OBS, fs   | `ports`, `contracts`, deps |
| `src/cli`       | yargs entry + command handlers; wires adapters into core. A client, not the app        | everything above           |

The dependency rule points inward: `core` never imports an adapter, and
`contracts` imports nothing but zod. Anything that validates external input
(CLI flags, config files, playlist files, HTTP bodies) does it with a zod
schema from `contracts`.

## Run model

We run TypeScript directly with Node's native type stripping (Node ≥ 24) —
no build step, no `dist/`, no loader dependency. `opl.mjs` stays as the bin
entry (a shim importing `src/cli`), and `node --test` runs `.test.ts` files
as-is. The trade-offs, enforced by `tsconfig.json`:

- **Erasable syntax only** (`erasableSyntaxOnly`): no `enum`, `namespace`, or
  constructor parameter properties. Use `as const` unions and plain classes.
- **Explicit extensions**: relative imports must say `./foo.ts`
  (`allowImportingTsExtensions`).
- **`import type` for types** (`verbatimModuleSyntax`): type-only imports must
  be marked, since Node strips rather than analyzes.

Type safety comes from `npm run typecheck` (`tsc --noEmit`, `strict`), which
runs in CI. The alternative — compiling to `dist/` and pointing the bin at
built JS — was rejected because this package is private (never published to
npm), and a build step buys nothing but drift between source and artifact.

## Testing

- Unit tests: `node --test` against core/contracts (pure, fast).
- E2E: Playwright specs against `opl serve`.
- Full render pipeline e2e (`npm run test:e2e:render`): fluidsynth + the
  TimGM6mb GM soundfont stand in for the OPL3 Duo hardware, and a loopback
  audio device (ALSA snd-aloop / BlackHole) stands in for the board's analog
  capture — CI runs the real `opl render` chain on both Linux and macOS and
  asserts the finished MP4 is non-silent. Opt-in via `OPL_RENDER_E2E=1`
  (see tests/render-pipeline.e2e.ts for the env knobs).
- Red/Green TDD for new behavior: write the failing test first.
