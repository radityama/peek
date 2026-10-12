import { defineConfig, devices } from '@playwright/test'

// The e2e server runs on its own port with --strictPort. Attaching to a server
// that happens to already answer on a shared port would test someone else's app.
const port = 4321
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Run against the artifact that ships, not the dev server. In dev the module
    // graph is unbundled, so hydration finishes well after the load event and a
    // click issued by a test is silently dropped instead of failing.
    command: 'pnpm build && pnpm exec vite preview --port 4321 --strictPort',
    url: baseURL,
    // Always start our own server. Reusing whatever responds on the port is how
    // a stale or unrelated process silently becomes the system under test.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
