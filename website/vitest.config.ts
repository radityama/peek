import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  define: { __PEEK_VERSION__: JSON.stringify(rootPackage.version) },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
