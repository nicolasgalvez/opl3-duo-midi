import { test, expect } from '@playwright/test'
import { startTestServer, stopTestServer } from './server-helper.mjs'

// The headless renderer page (web/render.html) is independent of the player UI
// and is always served from web/. These verify its minimized + overlay layouts.
// (The player page's layouts are covered by webapp-layout.spec.mjs against v2.)

test.describe('minimized render page', () => {
  const PORT = 7391
  let proc
  test.beforeAll(async () => {
    proc = await startTestServer('minimized', PORT)
  })
  test.afterAll(() => stopTestServer(proc))

  test('hides the header and uses a large title', async ({ browser }) => {
    const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}` })
    await page.goto('/render.html')
    await expect(page.locator('.header')).toBeHidden()
    await expect(page.locator('#track-name')).toContainText('scale', { timeout: 5000 })
    const fontSize = await page.locator('#track-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(fontSize).toBeGreaterThan(20)
    await page.close()
  })
})

test.describe('overlay render page', () => {
  const PORT = 7392
  let proc
  test.beforeAll(async () => {
    proc = await startTestServer('overlay', PORT)
  })
  test.afterAll(() => stopTestServer(proc))

  test('is minimal (transparent, no chrome) with a corner equalizer', async ({ browser }) => {
    const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 720 } })
    await page.goto('/render.html')
    await expect(page.locator('#track-name')).toContainText('scale', { timeout: 5000 })
    await expect(page.locator('.header')).toBeHidden()
    await expect(page.locator('.scanlines')).toBeHidden()
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe('rgba(0, 0, 0, 0)')
    const eqBox = await page.locator('#eq').boundingBox()
    expect(eqBox).not.toBeNull()
    expect(eqBox.width).toBeLessThanOrEqual(120)
    await page.close()
  })
})
