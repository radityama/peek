import { expect, test } from '@playwright/test'

test('primary nav reaches the docs', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Docs' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Quick start',
  )
})

test('mobile menu toggles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
  await expect(
    page.locator('#mobile-nav').getByRole('link', { name: 'Changelog' }),
  ).toBeVisible()
})

test('unknown routes render the 404 page', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByText('This route does not exist.')).toBeVisible()
})
