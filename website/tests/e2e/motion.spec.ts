import { expect, test } from '@playwright/test'

test('content is visible immediately with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Nothing to configure.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Know what Peek is doing.' }),
  ).toBeVisible()
})
