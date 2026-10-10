import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['tests/setup.ts'],
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration files spawn CLIs and process-table inspectors. CI hosts are
    // CPU-constrained, and parallel workers starve those children until
    // readiness polls time out. One worker keeps the suite deterministic there;
    // local runs keep full parallelism.
    ...(process.env.CI ? { maxWorkers: 1 } : {}),
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
