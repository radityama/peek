# Peek Marketing Website — Motion, QA, CI, Deploy & PR Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the website with replayable, reduced-motion-safe interaction, a real browser test suite, accessibility and responsive checks, a path-filtered CI workflow, a Cloudflare Workers deploy configuration, and finally push the branch and open the PR.

**Architecture:** Motion lives in one small `Reveal` primitive plus a `useActiveSection` scroll-spy hook, both disabled under `prefers-reduced-motion`. Playwright drives the real dev server for interaction, overflow, and axe checks. Deployment uses the official Cloudflare Vite plugin (registered first, SSR environment) with a `wrangler.jsonc` Worker entry, so the prerendered site is served from Workers.

**Tech Stack:** Adds `@playwright/test` and `@axe-core/playwright`; adds `@cloudflare/vite-plugin` and `wrangler` for deploy.

**Spec:** `docs/superpowers/specs/2026-10-12-peek-marketing-website-design.md`
**Depends on:** Plan 1 and Plan 2 must be fully implemented.

---

## File structure (created or changed by this plan)

```
website/
├── package.json                    # + test:e2e, screenshots, deploy, cf-typegen
├── playwright.config.ts            # dev-server webServer, chromium project
├── wrangler.jsonc                  # Worker name, entry, nodejs_compat
├── vite.config.ts                  # + cloudflare plugin (first)
├── README.md                       # dev, build, deploy, env
├── src/
│   ├── components/
│   │   ├── Reveal.tsx
│   │   └── RouteRail.tsx           # + active section
│   └── hooks/
│       └── useActiveSection.ts
├── scripts/
│   └── screenshots.mjs
└── tests/e2e/
    ├── home.spec.ts
    ├── copy.spec.ts
    ├── navigation.spec.ts
    ├── motion.spec.ts
    └── a11y.spec.ts
.github/workflows/website.yml
```

---

### Task 1: Reduced-motion-safe reveals and rail scroll spy

**Files:**
- Create: `website/src/components/Reveal.tsx`
- Create: `website/src/hooks/useActiveSection.ts`
- Modify: `website/src/components/RouteRail.tsx`
- Modify: `website/src/sections/home/HomePage.tsx` (wrap sections in `Reveal`)

- [ ] **Step 1: Create `website/src/components/Reveal.tsx`**

```tsx
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

interface RevealProps {
  readonly children: ReactNode
  readonly delay?: number
  readonly className?: string
}

/**
 * Fades and lifts content into view once. Under prefers-reduced-motion the
 * children render with no animation and no offset, so the static state is the
 * real state.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.42, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 2: Create `website/src/hooks/useActiveSection.ts`**

```ts
import { useEffect, useState } from 'react'

export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (ids.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const first = visible[0]
        if (first) setActive(first.target.id)
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    )

    for (const id of ids) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [ids])

  return active
}
```

- [ ] **Step 3: Update `website/src/components/RouteRail.tsx` to highlight the active stop**

Replace the component with:

```tsx
import { useMemo } from 'react'
import { useActiveSection } from '../hooks/useActiveSection'
import { cn } from '../lib/cn'

export interface RailStop {
  readonly id: string
  readonly label: string
}

export function RouteRail({
  stops,
  className,
}: {
  readonly stops: readonly RailStop[]
  readonly className?: string
}) {
  const ids = useMemo(() => stops.map((stop) => stop.id), [stops])
  const active = useActiveSection(ids)

  if (stops.length === 0) return null

  return (
    <nav
      aria-label="Page sections"
      className={cn(
        'fixed left-6 top-1/2 hidden -translate-y-1/2 xl:block',
        className,
      )}
    >
      <ol className="flex flex-col gap-4">
        {stops.map((stop, index) => {
          const isActive = stop.id === active
          return (
            <li key={stop.id}>
              <a
                href={`#${stop.id}`}
                aria-current={isActive ? 'true' : undefined}
                className="group flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em]"
              >
                <span
                  className={cn(
                    'h-px transition-all duration-[var(--dur-base)] group-hover:w-8 group-hover:bg-accent',
                    isActive ? 'w-8 bg-accent' : 'w-4 bg-line',
                  )}
                />
                <span
                  className={cn(
                    'transition-colors duration-[var(--dur-base)]',
                    isActive ? 'text-ink' : 'text-ink-3 group-hover:text-ink',
                  )}
                >
                  {String(index + 1).padStart(2, '0')} {stop.label}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
```

- [ ] **Step 4: Wrap the homepage sections in `Reveal`**

In `website/src/sections/home/HomePage.tsx`, import `Reveal` and wrap each
section after the hero:

```tsx
import { Reveal } from '../../components/Reveal'
// …existing imports…

  return (
    <>
      <RouteRail stops={railStops} />
      <HomeHero />
      <Reveal>
        <OneCommand />
      </Reveal>
      <Reveal>
        <ConnectionStory />
      </Reveal>
      <Reveal>
        <ShareIntent />
      </Reveal>
      <Reveal>
        <RealDevelopment />
      </Reveal>
      <Reveal>
        <Transparency />
      </Reveal>
      <Reveal>
        <Signoff />
      </Reveal>
    </>
  )
```

- [ ] **Step 5: Build, typecheck, lint, then commit**

```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
git add website/src/components/Reveal.tsx website/src/hooks/useActiveSection.ts website/src/components/RouteRail.tsx website/src/sections/home/HomePage.tsx
git commit -m "feat(website): add reduced-motion reveals and rail scroll spy"
```

---

### Task 2: Playwright setup

**Files:**
- Modify: `website/package.json` (add `test:e2e` script and dev dependencies)
- Create: `website/playwright.config.ts`

- [ ] **Step 1: Add Playwright**

Run:
```bash
pnpm -C website add -D @playwright/test @axe-core/playwright
pnpm -C website exec playwright install chromium
```

- [ ] **Step 2: Add the e2e script**

In `website/package.json`, add to `scripts`:

```json
    "test:e2e": "playwright test"
```

- [ ] **Step 3: Create `website/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 4: Add the e2e test directory to `.gitignore` outputs**

In `website/.gitignore`, the existing entries already cover `test-results/` and
`playwright-report/`. Add the browser cache:

```gitignore
playwright/.cache/
```

- [ ] **Step 5: Verify Playwright starts and finds zero tests**

Run: `pnpm -C website test:e2e`
Expected: exits 0 with a warning that no tests were found (the directory is
empty until Task 3).

- [ ] **Step 6: Commit**

```bash
git add website/package.json website/pnpm-lock.yaml website/playwright.config.ts website/.gitignore
git commit -m "test(website): add playwright configuration"
```

---

### Task 3: Interaction, overflow, and content tests

**Files:**
- Create: `website/tests/e2e/home.spec.ts`
- Create: `website/tests/e2e/copy.spec.ts`
- Create: `website/tests/e2e/navigation.spec.ts`
- Create: `website/tests/e2e/motion.spec.ts`

- [ ] **Step 1: Write `website/tests/e2e/home.spec.ts`**

```ts
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
```

- [ ] **Step 2: Write `website/tests/e2e/copy.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('copy button confirms and writes the install command', async ({ page }) => {
  await page.goto('/')
  const button = page
    .getByRole('button', { name: 'Copy install command' })
    .first()
  await button.click()
  await expect(button).toHaveText('Copied')
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe('pnpm add -g @usepeek/peek')
})
```

- [ ] **Step 3: Write `website/tests/e2e/navigation.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

test('primary nav reaches the docs', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Docs' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quick start')
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
```

- [ ] **Step 4: Write `website/tests/e2e/motion.spec.ts`**

```ts
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
```

- [ ] **Step 5: Run the suite**

Run: `pnpm -C website test:e2e`
Expected: all tests pass. If `home.spec.ts` replay timing is flaky in CI, raise
the `timeout` on the final assertion rather than shortening the step delays.

- [ ] **Step 6: Commit**

```bash
git add website/tests/e2e
git commit -m "test(website): cover hero, copy, navigation, overflow, and reduced motion"
```

---

### Task 4: Accessibility checks

**Files:**
- Create: `website/tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Write `website/tests/e2e/a11y.spec.ts`**

```ts
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
```

- [ ] **Step 2: Run the accessibility suite**

Run: `pnpm -C website test:e2e`
Expected: all axe tests pass. If a real violation appears, fix the markup (do
not add a blanket axe exclusion unless the rule is genuinely inapplicable, and
document why in a comment).

- [ ] **Step 3: Commit**

```bash
git add website/tests/e2e/a11y.spec.ts
git commit -m "test(website): add axe accessibility checks"
```

---

### Task 5: Screenshot review script

**Files:**
- Create: `website/scripts/screenshots.mjs`
- Modify: `website/package.json` (add `screenshots` script)
- Modify: `website/.gitignore` (ignore generated screenshots)

- [ ] **Step 1: Create `website/scripts/screenshots.mjs`**

```js
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
```

- [ ] **Step 2: Add the script**

In `website/package.json`, add to `scripts`:

```json
    "screenshots": "node scripts/screenshots.mjs"
```

- [ ] **Step 3: Ignore generated screenshots**

Append to `website/.gitignore`:

```gitignore
screenshots/
```

- [ ] **Step 4: Capture screenshots for review**

Run, in two terminals:
```bash
pnpm -C website dev
pnpm -C website screenshots
```
Expected: `website/screenshots/` contains 12 PNGs. Review them for spacing,
contrast, and overflow before opening the PR. These are for human review and are
not committed.

- [ ] **Step 5: Commit**

```bash
git add website/scripts/screenshots.mjs website/package.json website/.gitignore
git commit -m "chore(website): add screenshot review script"
```

---

### Task 6: Path-filtered website CI workflow

**Files:**
- Create: `.github/workflows/website.yml`

- [ ] **Step 1: Create `.github/workflows/website.yml`**

Match the action versions already used by `ci.yml` so the repository stays
consistent.

```yaml
name: Website

on:
  push:
    branches: [main]
    paths:
      - 'website/**'
      - '.github/workflows/website.yml'
  pull_request:
    paths:
      - 'website/**'
      - '.github/workflows/website.yml'

jobs:
  verify:
    name: website
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: 11.20.0
      - uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: pnpm
          cache-dependency-path: website/pnpm-lock.yaml
      - run: pnpm -C website install --frozen-lockfile
      - run: pnpm -C website lint
      - run: pnpm -C website typecheck
      - run: pnpm -C website test
      - run: pnpm -C website build
      - run: pnpm -C website exec playwright install --with-deps chromium
      - run: pnpm -C website test:e2e
```

- [ ] **Step 2: Validate the workflow locally**

Run:
```bash
pnpm -C website install --frozen-lockfile
pnpm -C website lint && pnpm -C website typecheck && pnpm -C website test && pnpm -C website build
pnpm -C website exec playwright install --with-deps chromium
pnpm -C website test:e2e
```
Expected: every command exits 0. This is the exact sequence the workflow runs.

- [ ] **Step 3: Confirm the root workflow is unaffected**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass; the root `biome.json` `!!website` exclusion keeps website
files out of the root lint pass.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/website.yml
git commit -m "ci(website): verify website build, tests, and e2e on matching changes"
```

---

### Task 7: Cloudflare Workers deployment configuration

Verified against the TanStack Start hosting guide and Cloudflare Workers docs:
the Cloudflare plugin must be registered **first** and assigned to the `ssr`
Vite environment, and the Worker entry is resolved by Wrangler from
`@tanstack/react-start/server-entry`.

**Files:**
- Modify: `website/package.json` (add the plugins; add deploy scripts)
- Modify: `website/vite.config.ts` (register the Cloudflare plugin first)
- Create: `website/wrangler.jsonc`
- Modify: `website/.gitignore` (ignore `.wrangler/`)

- [ ] **Step 1: Add the deployment dependencies**

Run:
```bash
pnpm -C website add -D @cloudflare/vite-plugin wrangler
```

- [ ] **Step 2: Register the Cloudflare plugin in `website/vite.config.ts`**

Add the import and place `cloudflare(...)` before `tanstackStart(...)`:

```ts
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { buildRobotsTxt, buildSitemapXml } from './src/lib/sitemap'

export default defineConfig({
  server: {
    port: 3001,
    fs: { allow: ['..'] },
  },
  define: {
    __PEEK_VERSION__: JSON.stringify(peekVersion),
  },
  plugins: [
    // The Cloudflare plugin must come first and own the SSR environment.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({ prerender: { enabled: true, crawlLinks: true } }),
    // React's Vite plugin must come after the Start plugin.
    viteReact(),
    seoAssets(),
  ],
})
```

Keep the existing `peekVersion` and `seoAssets()` definitions unchanged.

- [ ] **Step 3: Create `website/wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "peek-website",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": {
    "enabled": true
  }
}
```

- [ ] **Step 4: Add deploy scripts**

In `website/package.json`, add to `scripts`:

```json
    "preview": "vite preview",
    "deploy": "pnpm build && wrangler deploy",
    "cf-typegen": "wrangler types"
```

- [ ] **Step 5: Ignore Wrangler state**

Append to `website/.gitignore`:

```gitignore
.wrangler/
```

- [ ] **Step 6: Build with the Cloudflare plugin and verify output**

Run:
```bash
pnpm -C website build
find website -name 'sitemap.xml' -not -path '*/node_modules/*'
find website -name 'robots.txt' -not -path '*/node_modules/*'
find website -name '*.html' -not -path '*/node_modules/*' | wc -l
```
Expected: `sitemap.xml` and `robots.txt` are emitted, and at least 7 HTML files
are prerendered. The output directory changes from `.output` to the Cloudflare
plugin's layout; use `find` rather than a hard-coded path so later steps do not
break.

- [ ] **Step 7: Update the prerender verification commands in the earlier plans**

Because the output directory moved, any `.output` path in Plan 1 and Plan 2 exit
criteria should be read as "the prerendered HTML directory produced by the
current build". Prefer the `find website -name '*.html' -not -path '*/node_modules/*'`
form.

- [ ] **Step 8: Confirm a local production preview works**

Run (in two terminals):
```bash
pnpm -C website preview
curl -sSf http://localhost:4173/ >/dev/null && echo "preview ok"
```
Expected: `preview ok`. If the preview port differs, read the port Vite prints
and curl that instead.

- [ ] **Step 9: Commit**

```bash
git add website/package.json website/pnpm-lock.yaml website/vite.config.ts website/wrangler.jsonc website/.gitignore
git commit -m "feat(website): configure cloudflare workers deployment"
```

- [ ] **Step 10: Document that deployment is not automated**

Deployment requires Cloudflare credentials. Leave CI without a deploy step.
Record in the PR description that `pnpm -C website deploy` is the manual deploy
command and that `VITE_SITE_URL` must be set to the deployed origin so the
generated `sitemap.xml` and `robots.txt` use absolute production URLs.

---

### Task 8: README, antislop audit, final gate, push, and PR

**Files:**
- Create: `website/README.md`
- Modify: website source as required by the audit
- Modify: `AGENTS.md` (document the website package) — only if it stays accurate and brief

- [ ] **Step 1: Write `website/README.md`**

```markdown
# Peek website

The marketing site for [Peek](../../README.md), built with TanStack Start, React
19, Tailwind CSS v4, and Motion.

## Requirements

- Node.js 22 or newer
- pnpm 11.20.0

## Commands

```sh
pnpm install
pnpm dev          # http://localhost:3001
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # browser tests (Playwright; needs pnpm exec playwright install chromium)
pnpm lint
pnpm typecheck
pnpm build
pnpm preview
pnpm screenshots  # needs the dev server running
pnpm deploy       # build and deploy to Cloudflare Workers
```

## Content sources

The site reads repository documentation at build time. Editing these files
changes the site:

| Site route | Source |
| --- | --- |
| `/changelog` | `../CHANGELOG.md` |
| `/docs/cli` | `../docs/CLI.md` |
| `/docs/troubleshooting` | `../docs/TROUBLESHOOTING.md` |
| `/security` | `../docs/SECURITY.md` |

Everything else under `src/content` and `src/sections` is authored directly in
this directory. There is no CMS, no database, and no runtime API.

## Deployment

The site deploys to Cloudflare Workers. Set `VITE_SITE_URL` to the public origin
so the generated `sitemap.xml` and `robots.txt` contain absolute production URLs:

```sh
VITE_SITE_URL=https://example.com pnpm deploy
```

Prerendering is enabled, so every route ships as static HTML and is then served
by the Worker.
```

- [ ] **Step 2: Run the antislop audit**

Load and follow these skills, in order:
`/home/raditya/.pi/agent/skills/antislop/SKILL.md`,
`/home/raditya/.pi/agent/skills/antislop-code/SKILL.md`,
`/home/raditya/.pi/agent/skills/antislop-copywriting/SKILL.md`.

Apply the audit to `website/src/**` and `website/README.md`:

- Copy: remove em-dash-heavy rhythms, "not just X but Y" constructions, empty
  intensifiers, and three-item lists that exist only to sound complete. Every
  product claim must be traceable to `README.md`, `docs/CLI.md`, or
  `docs/SECURITY.md`.
- Comments: delete comments that restate the code; keep only comments that
  explain a non-obvious constraint. Do not change behavior in this step.

- [ ] **Step 3: Verify the honesty constraints survived the audit**

Confirm the site still states, in visible copy, that: the URL is temporary and
the hostname changes each run; there is no uptime guarantee; `--private` does
not rebind the application; `--password` protects the proxy and consumes the
`Authorization` header; and tunnels are for development, not production
hosting. Grep to check the wording is still present:

```bash
grep -rniE 'hostname changes|uptime|--private|--password|not a hosting' website/src | sort
```

- [ ] **Step 4: Run the complete gate**

Run:
```bash
pnpm -C website lint && pnpm -C website typecheck && pnpm -C website test && pnpm -C website build
pnpm -C website test:e2e
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm pack:check
```
Expected: every command exits 0.

- [ ] **Step 5: Confirm the published CLI package excludes the website**

Run:
```bash
npm pack --dry-run --json | grep -c 'website/' || echo "no website files in the package"
```
Expected: `no website files in the package` (or `0`). The `files` allowlist in
the root `package.json` must not have been widened.

- [ ] **Step 6: Commit the documentation and audit fixes**

```bash
git add website/README.md website/src
git commit -m "docs(website): add website readme and apply copy audit"
```

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feat/marketing-website
```

- [ ] **Step 8: Open the pull request**

```bash
gh pr create --title "feat: add the Peek marketing website" --body "$(cat <<'EOF'
## What this adds

A marketing website for Peek in an isolated `website/` package: TanStack Start,
React 19, Tailwind CSS v4, and Motion, prerendered to static HTML and deployable
to Cloudflare Workers.

Routes: `/`, `/features`, `/docs`, `/docs/cli`, `/docs/troubleshooting`,
`/changelog`, `/security`, and a 404 page.

## Isolation

- `website/` has its own `package.json` and lockfile. The repository stays a
  single CLI package; there is no monorepo.
- The root `package.json` `files` allowlist is unchanged, so `website/` is not
  published to npm.
- The root `biome.json` excludes `website`, so the root lint pass is unaffected.
- CI for the website is path-filtered to `website/**` and does not replace the
  existing multi-platform CLI workflow.

## Honesty

The site states the real limits: previews are temporary and the hostname changes
each run, there is no uptime guarantee, `--private` does not rebind the
application, `--password` protects the local proxy and consumes the
`Authorization` header, and tunnels are for development rather than production
hosting.

## Verification

- `pnpm -C website lint && pnpm -C website typecheck && pnpm -C website test && pnpm -C website build`
- `pnpm -C website test:e2e` (Playwright: content, copy, navigation, overflow at
  360/768/1440, reduced motion, axe on every route)
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm pack:check`
- Screenshots captured for desktop and mobile review (`pnpm -C website screenshots`)

Deployment is manual and requires Cloudflare credentials:
`VITE_SITE_URL=https://<origin> pnpm -C website deploy`.
EOF
)"
```

- [ ] **Step 9: Verify the pull request**

Run: `gh pr view --web`
Expected: the PR opens with the description above. Confirm CI starts for both the
root workflow and the website workflow.

---

## Plan 3 exit criteria

- `pnpm -C website test:e2e` passes with content, copy, navigation, overflow,
  reduced-motion, and axe coverage.
- Motion is disabled under `prefers-reduced-motion`; no content depends on an
  animation to become visible.
- `.github/workflows/website.yml` runs install, lint, typecheck, unit tests,
  build, and e2e for changes under `website/**`.
- Cloudflare Workers configuration builds and previews locally; the deploy step
  is documented as manual.
- The antislop audit is complete and no product claim contradicts the CLI docs.
- `feat/marketing-website` is pushed and a pull request is open.
- The root CLI package still builds, packs, and passes its full gate without
  including any website file.
