import { test, expect } from '@playwright/test'
import { startTestServer, stopTestServer } from './server-helper.mjs'

// The render page (web/render.html) is served by an `opl serve` instance booted
// for this spec on its own port. (The global Playwright webServer was removed in
// ODM-7; every spec now boots its own server.)
const PORT = 7393
const BASE = `http://127.0.0.1:${PORT}`
test.use({ baseURL: BASE })

let proc
test.beforeAll(async () => {
  proc = await startTestServer(null, PORT)
})
test.afterAll(() => stopTestServer(proc))

test('render page shows fullscreen visualizer with no interactive controls', async ({ page }) => {
  await page.goto('/render.html')

  // Canvas equalizer must be present and visible
  await expect(page.locator('#eq')).toBeVisible()

  // Track name should populate from SSE state (fixture is "scale.mid")
  await expect(page.locator('#track-name')).toContainText('scale', { timeout: 5000 })

  // No interactive controls — render is a display-only surface
  await expect(page.locator('#device')).toHaveCount(0)
  await expect(page.locator('#list')).toHaveCount(0)
  await expect(page.locator('.transport')).toHaveCount(0)

  // Album art img element exists (hidden when no art configured)
  await expect(page.locator('#art')).toHaveCount(1)
})

test('equalizer canvas fills a significant portion of the viewport', async ({ page }) => {
  await page.goto('/render.html')
  await expect(page.locator('#track-name')).toContainText('scale', { timeout: 5000 })

  const vh = page.viewportSize().height
  const box = await page.locator('#eq').boundingBox()
  expect(box).not.toBeNull()
  // With no art, the EQ should claim most of the screen
  expect(box.height).toBeGreaterThan(vh * 0.35)
})

test('CRT scanline overlay is present', async ({ page }) => {
  await page.goto('/render.html')
  await expect(page.locator('.scanlines')).toHaveCount(1)
  await expect(page.locator('.vignette')).toHaveCount(1)
})

test.describe('aspect ratio layouts', () => {
  for (const [name, size] of [
    ['16:9 landscape', { width: 1280, height: 720 }],
    ['9:16 vertical', { width: 720, height: 1280 }],
    ['1:1 square', { width: 1080, height: 1080 }],
  ]) {
    test(`render page adapts to ${name}`, async ({ browser }) => {
      const page = await browser.newPage({ viewport: size, baseURL: BASE })
      await page.goto('/render.html')
      await expect(page.locator('#eq')).toBeVisible()
      await expect(page.locator('#track-name')).toContainText('scale', { timeout: 5000 })

      // No horizontal or vertical scrollbar
      const overflow = await page.evaluate(() => ({
        x: document.body.scrollWidth > document.body.clientWidth,
        y: document.body.scrollHeight > document.body.clientHeight,
      }))
      expect(overflow.x).toBe(false)
      expect(overflow.y).toBe(false)

      await page.close()
    })
  }
})
