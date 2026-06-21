import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('renders the player shell', async ({ page }) => {
  await expect(page).toHaveTitle(/OPL/)
  await expect(page.locator('#eq')).toBeVisible()
  await expect(page.locator('#device')).toBeVisible()
  for (const act of ['prev', 'play', 'pause', 'stop', 'next']) {
    await expect(page.locator(`.transport button[data-act="${act}"]`)).toBeVisible()
  }
})

test('lists the fixture track and shows it as now-playing', async ({ page }) => {
  const items = page.locator('#list li')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('scale')
  await expect(page.locator('#np-name')).toContainText('scale')
})

test('the equalizer canvas fills most of the viewport height', async ({ page }) => {
  const vh = page.viewportSize().height
  const box = await page.locator('#eq').boundingBox()
  expect(box).not.toBeNull()
  // With the viewport-height fix the canvas should claim the bulk of the page.
  expect(box.height).toBeGreaterThan(vh * 0.45)
})

test('transport buttons post commands to the server', async ({ page }) => {
  const posted = []
  // Intercept so the test never actually streams MIDI to a device.
  await page.route('**/api', async (route) => {
    posted.push(JSON.parse(route.request().postData() || '{}').action)
    await route.fulfill({ status: 200, body: 'ok' })
  })
  await page.locator('.transport button[data-act="play"]').click()
  await page.locator('.transport button[data-act="next"]').click()
  await expect.poll(() => posted).toEqual(['play', 'next'])
})
