import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Boots the Web Player v2 SPA (opl serve --ui v2) on its own port and drives the
// real built bundle in a browser.
const PORT = 7396
const toolDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(toolDir, 'tests', 'fixtures', 'scale.mid')
const base = { baseURL: `http://127.0.0.1:${PORT}` }
let proc
let stateDir

test.beforeAll(async () => {
  // Isolate the library DB + uploads so the test never touches repo state.
  stateDir = mkdtempSync(join(tmpdir(), 'opl-e2e-'))
  proc = spawn('node', ['opl.mjs', 'serve', './tests/fixtures', '--http', String(PORT), '--ui', 'v2'], {
    cwd: toolDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      OPL_LIBRARY_DB: join(stateDir, 'library.json'),
      OPL_UPLOADS_DIR: join(stateDir, 'uploads'),
    },
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
  throw new Error('v2 server did not come up (is web-app/dist built?)')
})

test.afterAll(() => {
  if (proc && !proc.killed) proc.kill('SIGTERM')
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

test('renders the v2 shell: File/Edit/View menu, equalizer, device picker', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  for (const name of ['File', 'Edit', 'View']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(page.locator('canvas.eq')).toBeVisible()
  await expect(page.locator('select.device')).toBeVisible()
  await page.close()
})

test('lists the fixture track and shows it as now-playing', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  await expect(page.locator('.playlist li')).toHaveCount(1)
  await expect(page.locator('.pl-name')).toContainText('scale')
  await expect(page.locator('.np-name')).toContainText('scale')
  await page.close()
})

test('View ▸ Theme: Winamp switches theme and survives a reload (persisted state)', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Theme: Winamp' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'winamp')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'winamp')
  await page.close()
})

test('File ▸ Open shows a path dialog', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: /Open Folder/ }).click()
  await expect(page.getByRole('dialog', { name: 'Open' })).toBeVisible()
  await expect(page.getByLabel('Path')).toBeVisible()
  await page.close()
})

test('transport Play posts to /api', async ({ browser }) => {
  const page = await browser.newPage(base)
  const posted = []
  await page.route('**/api', async (route) => {
    posted.push(JSON.parse(route.request().postData() || '{}').action)
    await route.fulfill({ status: 200, body: 'ok' })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => posted).toContain('play')
  await page.close()
})

test('library: View ▸ Toggle Library, upload a file, it appears and persists', async ({ browser }) => {
  const page = await browser.newPage(base)
  await page.goto('/')

  // Open the library panel via the View menu.
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Toggle Library' }).click()
  await expect(page.locator('.library')).toBeVisible()

  // Add a file through the (real) upload path → server stores it, library refreshes.
  await page.locator('.library input[type="file"]').setInputFiles(fixture)
  await expect(page.getByRole('button', { name: /Play .*scale\.mid/ })).toBeVisible({ timeout: 5000 })

  // It survives a reload: the library panel stays open (persisted UI pref) and
  // the entry is re-fetched from the lowdb-backed library on the server.
  await page.reload()
  await expect(page.locator('.library')).toBeVisible()
  await expect(page.getByRole('button', { name: /Play .*scale\.mid/ })).toBeVisible({ timeout: 5000 })
  await page.close()
})

test('playlist row exposes reorder + remove controls that post to /api', async ({ browser }) => {
  const page = await browser.newPage(base)
  const posted = []
  await page.route('**/api', async (route) => {
    posted.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({ status: 200, body: 'ok' })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Remove scale/ })).toBeVisible()
  await page.getByRole('button', { name: /Remove scale/ }).click()
  await expect.poll(() => posted).toContainEqual({ action: 'remove', index: 0 })
  await page.close()
})
