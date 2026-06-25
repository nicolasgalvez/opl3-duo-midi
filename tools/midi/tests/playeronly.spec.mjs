import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Boots the embeddable player-only preset: SoundFont output, no menu/upload/edit.
const PORT = 7410
const toolDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = { baseURL: `http://127.0.0.1:${PORT}` }
let proc
let stateDir

test.beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'opl-po-'))
  proc = spawn('node', ['opl.mjs', 'serve', './tests/fixtures', '--http', String(PORT), '--preset', 'player-only'], {
    cwd: toolDir,
    stdio: 'pipe',
    env: { ...process.env, OPL_LIBRARY_DB: join(stateDir, 'l.json'), OPL_UPLOADS_DIR: join(stateDir, 'u') },
  })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`)
      if (r.ok && (await r.text()).includes('id="root"')) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('player-only server did not come up')
})

test.afterAll(() => {
  if (proc && !proc.killed) proc.kill('SIGTERM')
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

test('serves the validated player-only config', async () => {
  const cfg = await (await fetch(`http://127.0.0.1:${PORT}/api/config`)).json()
  expect(cfg.output).toBe('soundfont')
  expect(cfg.features.menu).toBe(false)
  expect(cfg.features.library).toBe(false)
  expect(cfg.features.edit).toBe(false)
  expect(cfg.features.outputPicker).toBe(false)
})

test('UI hides menu / output picker / device picker (embeddable widget)', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  await expect(page.locator('.brand')).toBeVisible()
  await expect(page.getByRole('button', { name: 'File', exact: true })).toHaveCount(0)
  await expect(page.locator('.menubar')).toHaveCount(0)
  await expect(page.locator('.output-mode')).toHaveCount(0)
  await expect(page.locator('select.device')).toHaveCount(0)
  await page.close()
})

test('output is locked to SoundFont and Play synthesizes audio', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  // No output picker, but the controller mounts in SoundFont mode → meter exists.
  await page.getByRole('button', { name: 'Play' }).click()
  const meter = page.getByTestId('sf-meter')
  await expect
    .poll(async () => Number(await meter.getAttribute('data-level')), { timeout: 12000, intervals: [120] })
    .toBeGreaterThan(0)
  await page.close()
})
