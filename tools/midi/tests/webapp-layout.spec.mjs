import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Verifies the v2 SPA reaches visual parity with the classic page for the
// minimized and overlay layouts (driven here via the View menu).
const PORT = 7411
const toolDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 720 } }
let proc
let stateDir

test.beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'opl-lay-'))
  proc = spawn('node', ['opl.mjs', 'serve', './tests/fixtures', '--http', String(PORT), '--ui', 'v2'], {
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
  throw new Error('v2 server did not come up')
})

test.afterAll(() => {
  if (proc && !proc.killed) proc.kill('SIGTERM')
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

async function setLayout(page, label) {
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: label }).click()
}

test('minimized: playlist hidden, large title', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  await setLayout(page, 'Layout: Minimized')
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'minimized')
  await expect(page.locator('.playlist-panel')).toBeHidden()
  const fs = await page.locator('.np-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(fs).toBeGreaterThan(18)
  await page.close()
})

test('overlay: transparent bg, chrome hidden, corner equalizer, stroked title', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  await setLayout(page, 'Layout: Overlay')
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'overlay')

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgba(0, 0, 0, 0)')
  await expect(page.locator('.topbar')).toBeHidden()
  await expect(page.locator('.transport')).toBeHidden()
  await expect(page.locator('.playlist-panel')).toBeHidden()

  const box = await page.locator('.eq').boundingBox()
  expect(box).not.toBeNull()
  expect(box.width).toBeLessThanOrEqual(120)
  expect(box.height).toBeLessThanOrEqual(120)
  expect(box.x).toBeGreaterThan(900)
  expect(box.y).toBeGreaterThan(500)

  const stroke = await page.locator('.np-name').evaluate((el) => getComputedStyle(el).webkitTextStrokeWidth)
  expect(parseFloat(stroke)).toBeGreaterThan(0)
  await page.close()
})
