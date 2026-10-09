import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['tests/setup.ts'],
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration files spawn CLIs and process-table inspectors. More workers
    // can starve those children on CI hosts and turn readiness into timeouts.
    maxWorkers: 2,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
