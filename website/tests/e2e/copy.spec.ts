import { expect, test } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('copy button confirms and writes the install command', async ({
  page,
}) => {
  await page.goto('/')
  const button = page
    .getByRole('button', { name: 'Copy install command' })
    .first()
  await button.click()
  await expect(button).toHaveText('Copied')
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe('pnpm add -g @usepeek/peek')
})
