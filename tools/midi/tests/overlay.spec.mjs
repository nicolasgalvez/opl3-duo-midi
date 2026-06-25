import { test, expect } from '@playwright/test'
import { startTestServer, stopTestServer } from './server-helper.mjs'

const PORT = 7392
let serverProc

test.beforeAll(async () => {
  serverProc = await startTestServer('overlay', PORT)
})

test.afterAll(() => {
  stopTestServer(serverProc)
})

test('overlay layout has transparent background', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}` })
  await page.goto('/')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgba(0, 0, 0, 0)')
  await page.close()
})

test('overlay layout hides chrome and keeps eq square in corner', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 720 } })
  await page.goto('/')
  await expect(page.locator('#np-name')).toContainText('scale', { timeout: 5000 })
  await expect(page.locator('.topbar')).toBeHidden()
  await expect(page.locator('.transport')).toBeHidden()
  await expect(page.locator('.playlist')).toBeHidden()

  const eqBox = await page.locator('#eq').boundingBox()
  expect(eqBox).not.toBeNull()
  expect(eqBox.width).toBeLessThanOrEqual(120)
  expect(eqBox.height).toBeLessThanOrEqual(120)
  expect(eqBox.x).toBeGreaterThan(900)
  expect(eqBox.y).toBeGreaterThan(500)
  await page.close()
})

test('overlay title uses high-contrast stroke', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}` })
  await page.goto('/')
  await expect(page.locator('#np-name')).toContainText('scale', { timeout: 5000 })
  const stroke = await page.locator('#np-name').evaluate((el) => getComputedStyle(el).webkitTextStrokeWidth)
  expect(parseFloat(stroke)).toBeGreaterThan(0)
  await page.close()
})

test('overlay render page is minimal with corner eq', async ({ browser }) => {
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
