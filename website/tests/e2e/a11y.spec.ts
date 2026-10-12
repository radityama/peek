import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const paths = [
  '/',
  '/features',
  '/docs',
  '/docs/cli',
  '/docs/troubleshooting',
  '/changelog',
  '/security',
] as const

for (const path of paths) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path)
    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    )
    expect(
      serious.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([])
  })
}
