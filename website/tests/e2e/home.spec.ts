import { expect, test } from '@playwright/test'

test('hero states the promise and the honest limits', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Run it here. Open it anywhere.',
  )
  await expect(
    page.getByText('No account, no config, no cloudflared install.'),
  ).toBeVisible()
  await expect(page.getByText(/Hostname changes each run/i)).toBeVisible()
})

test('terminal replay runs to completion', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Replay' }).click()
  await expect(page.getByRole('button', { name: 'Replaying…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Tunnel connected')).toBeVisible()
})

for (const width of [360, 768, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
}
