import { test, expect } from '@playwright/test'
import { startTestServer, stopTestServer } from './server-helper.mjs'

const PORT = 7391
let serverProc

test.beforeAll(async () => {
  serverProc = await startTestServer('minimized', PORT)
})

test.afterAll(() => {
  stopTestServer(serverProc)
})

test('minimized layout hides playlist', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}` })
  await page.goto('/')
  await expect(page.locator('.playlist')).toBeHidden()
  await expect(page.locator('#list')).toBeHidden()
  await page.close()
})

test('minimized layout shows large track title', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}` })
  await page.goto('/')
  await expect(page.locator('#np-name')).toContainText('scale', { timeout: 5000 })
  const fontSize = await page.locator('#np-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(fontSize).toBeGreaterThan(18)
  await page.close()
})

test('minimized render page hides header and uses large title', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}` })
  await page.goto('/render.html')
  await expect(page.locator('.header')).toBeHidden()
  await expect(page.locator('#track-name')).toContainText('scale', { timeout: 5000 })
  const fontSize = await page.locator('#track-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(fontSize).toBeGreaterThan(20)
  await page.close()
})

test('html root has data-layout=minimized', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${PORT}` })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'minimized')
  await page.close()
})
