import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseURL = process.env.BASE_URL ?? 'http://localhost:3001'
const outDir = new URL('../screenshots/', import.meta.url)

const pages = [
  ['home', '/'],
  ['features', '/features'],
  ['docs', '/docs'],
  ['docs-cli', '/docs/cli'],
  ['changelog', '/changelog'],
  ['security', '/security'],
]

const sizes = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

for (const size of sizes) {
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
  })
  for (const [name, path] of pages) {
    await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: new URL(`${name}-${size.name}.png`, outDir).pathname,
      fullPage: true,
    })
  }
  await page.close()
}

await browser.close()
console.log(`Screenshots written to ${outDir.pathname}`)
