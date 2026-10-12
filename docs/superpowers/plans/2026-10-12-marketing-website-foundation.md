# Peek Marketing Website — Foundation & Homepage Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an isolated, statically prerenderable TanStack Start website with the Peek design system, site shell, and a complete "The Route" homepage.

**Architecture:** A separate `website/` pnpm package (its own lockfile, no monorepo) using TanStack Start file-based routing, React 19, Tailwind CSS v4 tokens, and Motion for React. Content comes from build-time adapters so version/docs never duplicate. Pure logic is unit-tested with Vitest; browser behavior is verified with Playwright in Plan 3.

**Tech Stack:** TanStack Start 1.168, TanStack Router 1.170, React 19.3, Tailwind CSS 4.3 (`@tailwindcss/vite`), Motion 14 (`motion/react`), TypeScript 7.0, Vite 8, Vitest 5, Biome 2.5, pnpm 11.20, Node 22+.

**Spec:** `docs/superpowers/specs/2026-10-12-peek-marketing-website-design.md`

**Scope note:** This is Plan 1 of 3. Plan 2 covers the Markdown docs pipeline and secondary routes (`/features`, `/docs`, `/changelog`, `/security`, 404). Plan 3 covers motion polish, Playwright/screenshot/a11y QA, CI workflows, Cloudflare deployment, and opening the PR. Each plan produces working, testable software on its own.

---

## File structure (created by this plan)

```
website/
├── package.json                # isolated package + scripts
├── tsconfig.json               # Bundler resolution, react-jsx, strict
├── vite.config.ts              # tailwind + tanstackStart(prerender) + react; defines __PEEK_VERSION__
├── vitest.config.ts            # node env, tests/unit
├── biome.json                  # repo-aligned formatting
├── .gitignore
├── public/
│   └── favicon.svg
├── src/
│   ├── env.d.ts                # declares __PEEK_VERSION__ and ?url imports
│   ├── router.tsx              # createRouter(getRouter) + Register module
│   ├── routeTree.gen.ts        # generated (committed)
│   ├── styles/
│   │   ├── app.css             # font imports + tailwind + base layer
│   │   └── tokens.css          # @theme design tokens
│   ├── content/
│   │   ├── site.ts             # nav, footer, links, install commands
│   │   ├── version.ts          # version from build define
│   │   └── commands.ts         # composePeekCommand()
│   ├── lib/
│   │   └── cn.ts
│   ├── components/
│   │   ├── Container.tsx
│   │   ├── Section.tsx
│   │   ├── Eyebrow.tsx
│   │   ├── SectionHeading.tsx
│   │   ├── EditorialHeading.tsx
│   │   ├── PrimaryButton.tsx
│   │   ├── TextLink.tsx
│   │   ├── CornerMark.tsx
│   │   ├── CopyCommand.tsx
│   │   ├── RouteRail.tsx
│   │   ├── SiteHeader.tsx
│   │   └── SiteFooter.tsx
│   ├── hooks/
│   │   └── useCopy.ts
│   ├── scenes/
│   │   ├── terminal-machine.ts
│   │   ├── TerminalStage.tsx
│   │   ├── ConnectionPath.tsx
│   │   ├── DeviceFrame.tsx
│   │   └── HeroStage.tsx
│   ├── sections/home/
│   │   ├── HomeHero.tsx
│   │   ├── OneCommand.tsx
│   │   ├── ConnectionStory.tsx
│   │   ├── ShareIntent.tsx
│   │   ├── RealDevelopment.tsx
│   │   ├── Transparency.tsx
│   │   ├── Signoff.tsx
│   │   └── HomePage.tsx
│   └── routes/
│       ├── __root.tsx
│       ├── index.tsx
│       ├── features.tsx         # stub in Plan 1; real page in Plan 2
│       ├── docs.tsx             # stub in Plan 1; real page in Plan 2
│       ├── docs.cli.tsx         # stub in Plan 1; real page in Plan 2
│       ├── docs.troubleshooting.tsx  # stub in Plan 1; real page in Plan 2
│       ├── changelog.tsx        # stub in Plan 1; real page in Plan 2
│       └── security.tsx         # stub in Plan 1; real page in Plan 2
└── tests/unit/
    ├── tokens.test.ts
    ├── site.test.ts
    ├── version.test.ts
    ├── commands.test.ts
    ├── cn.test.ts
    └── terminal-machine.test.ts
```

---

### Task 1: Scaffold the isolated website package

**Files:**
- Modify: `biome.json` (repository root — exclude `website/` from the root lint)
- Create: `website/package.json`
- Create: `website/tsconfig.json`
- Create: `website/vite.config.ts`
- Create: `website/vitest.config.ts`
- Create: `website/biome.json`
- Create: `website/.gitignore`
- Create: `website/src/env.d.ts`
- Create: `website/src/styles/app.css`
- Create: `website/src/styles/tokens.css`
- Create: `website/src/router.tsx`
- Create: `website/src/routes/__root.tsx`
- Create: `website/src/routes/index.tsx`
- Create: `website/public/favicon.svg`

- [ ] **Step 1: Create `website/package.json`**

```json
{
  "name": "@usepeek/website",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.20.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite dev --port 3001",
    "build": "vite build",
    "preview": "vite preview --port 3001",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome check --write .",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource-variable/azeret-mono": "^5.3.0",
    "@fontsource-variable/host-grotesk": "^5.3.0",
    "@tanstack/react-router": "^1.170.42",
    "@tanstack/react-start": "^1.168.61",
    "motion": "^14.1.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.15",
    "@tailwindcss/vite": "^4.3.3",
    "@types/node": "^26.6.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.4",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: Create `website/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": false,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `website/vite.config.ts`**

```ts
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  server: { port: 3001 },
  define: { __PEEK_VERSION__: JSON.stringify(rootPackage.version) },
  plugins: [
    tailwindcss(),
    // crawlLinks stays off in Plan 1; enable it in Plan 3 once every linked
    // route (including /docs/cli and /docs/troubleshooting) exists.
    tanstackStart({ prerender: { enabled: true, crawlLinks: false } }),
    // React's Vite plugin must come after the Start plugin.
    viteReact(),
  ],
})
```

- [ ] **Step 4: Create `website/vitest.config.ts`**

```ts
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
```

- [ ] **Step 5: Create `website/biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "files": {
    "includes": [
      "**",
      "!!.output",
      "!!.tanstack",
      "!!.wrangler",
      "!!dist",
      "!!node_modules",
      "!!pnpm-lock.yaml",
      "!!src/routeTree.gen.ts"
    ]
  },
  "formatter": { "indentStyle": "space", "indentWidth": 2 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

- [ ] **Step 6: Create `website/.gitignore`**

```gitignore
node_modules/
.output/
.tanstack/
.wrangler/
dist/
test-results/
playwright-report/
```

- [ ] **Step 7: Create `website/src/env.d.ts`**

```ts
/// <reference types="vite/client" />

declare const __PEEK_VERSION__: string
```

- [ ] **Step 8: Create `website/src/styles/tokens.css`**

```css
@theme {
  --font-sans: 'Host Grotesk Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Azeret Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace;

  --text-display: clamp(2.75rem, 7vw, 6rem);
  --text-display--line-height: 0.98;
  --text-display--letter-spacing: -0.03em;
  --text-h2: clamp(1.9rem, 3.6vw, 3rem);
  --text-h2--line-height: 1.05;
  --text-h2--letter-spacing: -0.02em;
  --text-h3: clamp(1.25rem, 2vw, 1.6rem);
  --text-h3--line-height: 1.2;
  --text-body-lg: clamp(1.0625rem, 1.2vw, 1.1875rem);
  --text-body-lg--line-height: 1.6;
  --text-mono-xs: 0.8125rem;
  --text-mono-xs--line-height: 1.5;

  --color-bg: oklch(0.985 0.004 95);
  --color-surface: oklch(0.965 0.006 95);
  --color-ink: oklch(0.22 0.008 95);
  --color-ink-2: oklch(0.48 0.01 95);
  --color-ink-3: oklch(0.62 0.008 95);
  --color-line: oklch(0.89 0.008 95);
  --color-accent: oklch(0.55 0.2 33);
  --color-accent-strong: oklch(0.46 0.19 33);
  --color-success: oklch(0.52 0.13 150);
  --color-dark-bg: oklch(0.19 0.008 95);
  --color-dark-surface: oklch(0.24 0.008 95);
  --color-dark-ink: oklch(0.96 0.004 95);
  --color-dark-ink-2: oklch(0.72 0.006 95);
  --color-dark-line: oklch(0.32 0.008 95);

  --container-content: 72rem;
  --container-wide: 88rem;

  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

:root {
  --dur-quick: 120ms;
  --dur-base: 180ms;
  --dur-scene: 420ms;
}
```

- [ ] **Step 9: Create `website/src/styles/app.css`**

```css
@import 'tailwindcss';
@import '@fontsource-variable/host-grotesk';
@import '@fontsource-variable/azeret-mono';
@import './tokens.css';

@layer base {
  * {
    min-width: 0;
  }
  html {
    color-scheme: light;
    scrollbar-gutter: stable;
  }
  body {
    background-color: var(--color-bg);
    color: var(--color-ink);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 10: Create `website/src/router.tsx`**

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

- [ ] **Step 11: Create a minimal `website/src/routes/__root.tsx`**

This is a placeholder shell. Task 6 replaces it with the full header/footer shell.

```tsx
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Peek — Run your dev server. Share it instantly.' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <main id="main">
          <Outlet />
        </main>
        <Scripts />
      </body>
    </html>
  )
}
```

- [ ] **Step 12: Create a temporary `website/src/routes/index.tsx`**

This placeholder is replaced in Task 11. It must exist now so the route tree builds.

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="mx-auto max-w-content px-5 py-24">
      <h1 className="text-display">Peek</h1>
    </div>
  ),
})
```

- [ ] **Step 13: Create `website/public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="4" y="4" width="24" height="24" rx="6" stroke="#2A2825" stroke-width="2.5"/>
  <circle cx="21" cy="11" r="2.5" fill="#B8402A"/>
  <path d="M21 13.5 L26 20" stroke="#B8402A" stroke-width="2.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 14: Exclude `website/` from the root Biome config**

The root `pnpm lint` runs `biome check .`, which would otherwise walk the
unrelated `website/` tree with the root rules. Add one exclusion so root CI
stays green and the website owns its own config.

In `biome.json` (repository root), change the `files.includes` array to:

```json
"includes": ["**", "!!dist", "!!node_modules", "!!pnpm-lock.yaml", "!!website"]
```

- [ ] **Step 15: Install and build**

Run:
```bash
pnpm -C website install
pnpm -C website build
```
Expected: install succeeds, build succeeds, `website/.output` exists, and `website/src/routeTree.gen.ts` is generated.

- [ ] **Step 16: Verify typecheck and lint**

Run:
```bash
pnpm -C website typecheck
pnpm -C website lint
```
Expected: both exit 0.

- [ ] **Step 17: Verify the root gate is untouched (including lint)**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all root checks still pass, and `pnpm lint` does not traverse `website/`.

- [ ] **Step 18: Commit**

```bash
git add biome.json website
git commit -m "feat(website): scaffold isolated TanStack Start site"
```

---

### Task 2: Design-token guard test

**Files:**
- Test: `website/tests/unit/tokens.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(
  new URL('../../src/styles/tokens.css', import.meta.url),
  'utf8',
)

const REQUIRED = [
  '--font-sans',
  '--font-mono',
  '--text-display',
  '--text-h2',
  '--text-body-lg',
  '--color-bg',
  '--color-ink',
  '--color-ink-2',
  '--color-line',
  '--color-accent',
  '--color-accent-strong',
  '--color-success',
  '--color-dark-bg',
  '--color-dark-ink',
  '--container-content',
  '--container-wide',
  '--ease-out',
] as const

describe('design tokens', () => {
  it.each(REQUIRED)('declares %s', (token) => {
    expect(tokens).toContain(`${token}:`)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm -C website test`
Expected: PASS (tokens exist from Task 1). This is the guard: renaming a token later fails the suite.

- [ ] **Step 3: Commit**

```bash
git add website/tests/unit/tokens.test.ts
git commit -m "test(website): guard required design tokens"
```

---

### Task 3: Site content and pure helpers

**Files:**
- Create: `website/src/lib/cn.ts`
- Create: `website/src/content/site.ts`
- Create: `website/src/content/version.ts`
- Create: `website/src/content/commands.ts`
- Test: `website/tests/unit/cn.test.ts`
- Test: `website/tests/unit/site.test.ts`
- Test: `website/tests/unit/version.test.ts`
- Test: `website/tests/unit/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

`website/tests/unit/cn.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cn } from '../../src/lib/cn'

describe('cn', () => {
  it('joins truthy class names with single spaces', () => {
    expect(cn('a', false, 'b', undefined, null, 'c')).toBe('a b c')
  })

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, undefined, null)).toBe('')
  })
})
```

`website/tests/unit/site.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { absoluteUrl, site } from '../../src/content/site'

describe('site config', () => {
  it('uses the canonical install command', () => {
    expect(site.install.pnpm).toBe('pnpm add -g @usepeek/peek')
    expect(site.install.npm).toBe('npm install -g @usepeek/peek')
  })

  it('has a non-empty label for every footer link', () => {
    const labels = site.footer.flatMap((group) =>
      group.links.map((link) => link.label),
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((label) => label.trim().length > 0)).toBe(true)
  })

  it('builds absolute URLs without duplicating the trailing slash', () => {
    expect(absoluteUrl('/features')).toBe(`${site.website}/features`)
    expect(absoluteUrl('/')).toBe(site.website)
  })
})
```

`website/tests/unit/version.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { version } from '../../src/content/version'

describe('version', () => {
  it('matches the root package version', () => {
    const root = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    expect(version).toBe(root.version)
  })

  it('is a semver string', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
```

`website/tests/unit/commands.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { composePeekCommand } from '../../src/content/commands'

describe('composePeekCommand', () => {
  it('returns the bare command when nothing is selected', () => {
    expect(composePeekCommand({})).toBe('peek')
  })

  it('adds password and expiry in order', () => {
    expect(composePeekCommand({ password: true, expires: '30m' })).toBe(
      'peek --password --expires 30m',
    )
  })

  it('adds lan', () => {
    expect(composePeekCommand({ lan: true })).toBe('peek --lan')
  })

  it('adds private', () => {
    expect(composePeekCommand({ private: true })).toBe('peek --private')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm -C website test`
Expected: FAIL — "Cannot find module" for each new source file.

- [ ] **Step 3: Write `website/src/lib/cn.ts`**

```ts
export function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(' ')
}
```

- [ ] **Step 4: Write `website/src/content/site.ts`**

```ts
export interface LinkItem {
  readonly label: string
  readonly to: string
  readonly external?: boolean
}

export interface FooterGroup {
  readonly title: string
  readonly links: readonly LinkItem[]
}

export interface SiteConfig {
  readonly name: string
  readonly tagline: string
  readonly description: string
  readonly website: string
  readonly github: string
  readonly npm: string
  readonly install: { readonly pnpm: string; readonly npm: string }
  readonly nav: readonly LinkItem[]
  readonly footer: readonly FooterGroup[]
}

const website = (import.meta.env.VITE_SITE_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
)

export const site: SiteConfig = {
  name: 'Peek',
  tagline: 'Run your dev server. Share it instantly.',
  description:
    'Peek starts your development server, verifies its port, and opens a temporary HTTPS preview. No account, no config.',
  website,
  github: 'https://github.com/radityama/peek',
  npm: 'https://www.npmjs.com/package/@usepeek/peek',
  install: {
    pnpm: 'pnpm add -g @usepeek/peek',
    npm: 'npm install -g @usepeek/peek',
  },
  nav: [
    { label: 'Features', to: '/features' },
    { label: 'Docs', to: '/docs' },
    { label: 'Changelog', to: '/changelog' },
    { label: 'Security', to: '/security' },
  ],
  footer: [
    {
      title: 'Product',
      links: [
        { label: 'Features', to: '/features' },
        { label: 'Changelog', to: '/changelog' },
      ],
    },
    {
      title: 'Docs',
      links: [
        { label: 'Quick start', to: '/docs' },
        { label: 'CLI reference', to: '/docs/cli' },
        { label: 'Troubleshooting', to: '/docs/troubleshooting' },
      ],
    },
    {
      title: 'Security',
      links: [
        { label: 'Security model', to: '/security' },
        {
          label: 'Report a vulnerability',
          to: 'https://github.com/radityama/peek/security/advisories/new',
          external: true,
        },
      ],
    },
    {
      title: 'Project',
      links: [
        {
          label: 'GitHub',
          to: 'https://github.com/radityama/peek',
          external: true,
        },
        {
          label: 'Issues',
          to: 'https://github.com/radityama/peek/issues',
          external: true,
        },
        {
          label: 'MIT license',
          to: 'https://github.com/radityama/peek/blob/main/LICENSE',
          external: true,
        },
      ],
    },
  ],
}

export function absoluteUrl(path: string): string {
  if (path === '/') return website
  return `${website}${path}`
}
```

- [ ] **Step 5: Write `website/src/content/version.ts`**

```ts
export const version = __PEEK_VERSION__
```

- [ ] **Step 6: Write `website/src/content/commands.ts`**

```ts
export interface PeekCommandOptions {
  readonly password?: boolean
  readonly private?: boolean
  readonly lan?: boolean
  readonly expires?: string
}

export function composePeekCommand(options: PeekCommandOptions): string {
  const parts = ['peek']
  if (options.password) parts.push('--password')
  if (options.private) parts.push('--private')
  if (options.lan) parts.push('--lan')
  if (options.expires) parts.push('--expires', options.expires)
  return parts.join(' ')
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm -C website test`
Expected: all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add website/src/content website/src/lib website/tests/unit
git commit -m "feat(website): add site content, command builder, and helpers"
```

---

### Task 4: Base layout primitives

**Files:**
- Create: `website/src/components/Container.tsx`
- Create: `website/src/components/Section.tsx`
- Create: `website/src/components/Eyebrow.tsx`
- Create: `website/src/components/SectionHeading.tsx`
- Create: `website/src/components/EditorialHeading.tsx`
- Create: `website/src/components/PrimaryButton.tsx`
- Create: `website/src/components/TextLink.tsx`
- Create: `website/src/components/CornerMark.tsx`

- [ ] **Step 1: Create `website/src/components/Container.tsx`**

```tsx
import type { ElementType, ReactNode } from 'react'
import { cn } from '../lib/cn'

interface ContainerProps {
  readonly as?: ElementType
  readonly width?: 'content' | 'wide'
  readonly className?: string
  readonly children: ReactNode
}

export function Container({
  as: Component = 'div',
  width = 'content',
  className,
  children,
}: ContainerProps) {
  return (
    <Component
      className={cn(
        'mx-auto w-full px-5 sm:px-8 lg:px-12',
        width === 'wide' ? 'max-w-wide' : 'max-w-content',
        className,
      )}
    >
      {children}
    </Component>
  )
}
```

- [ ] **Step 2: Create `website/src/components/Section.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface SectionProps {
  readonly id?: string
  readonly tone?: 'light' | 'surface' | 'dark'
  readonly className?: string
  readonly children: ReactNode
}

const toneClass = {
  light: '',
  surface: 'bg-surface',
  dark: 'bg-dark-bg text-dark-ink',
} as const

export function Section({
  id,
  tone = 'light',
  className,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative py-[clamp(4rem,10vw,9rem)]',
        toneClass[tone],
        className,
      )}
    >
      <div className="mx-auto w-full max-w-wide px-5 sm:px-8 lg:px-12">
        {children}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create `website/src/components/Eyebrow.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface EyebrowProps {
  readonly children: ReactNode
  readonly className?: string
  readonly tone?: 'light' | 'dark'
}

export function Eyebrow({ children, className, tone = 'light' }: EyebrowProps) {
  return (
    <p
      className={cn(
        'font-mono text-mono-xs uppercase tracking-[0.14em]',
        tone === 'dark' ? 'text-dark-ink-2' : 'text-ink-2',
        className,
      )}
    >
      {children}
    </p>
  )
}
```

- [ ] **Step 4: Create `website/src/components/SectionHeading.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface SectionHeadingProps {
  readonly id?: string
  readonly children: ReactNode
  readonly className?: string
}

export function SectionHeading({
  id,
  children,
  className,
}: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className={cn('max-w-3xl text-h2 font-medium text-balance', className)}
    >
      {children}
    </h2>
  )
}
```

- [ ] **Step 5: Create `website/src/components/EditorialHeading.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface EditorialHeadingProps {
  readonly children: ReactNode
  readonly className?: string
}

export function EditorialHeading({
  children,
  className,
}: EditorialHeadingProps) {
  return (
    <p
      className={cn(
        'max-w-2xl text-body-lg text-pretty text-ink-2',
        className,
      )}
    >
      {children}
    </p>
  )
}
```

- [ ] **Step 6: Create `website/src/components/PrimaryButton.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface PrimaryButtonProps {
  readonly href: string
  readonly children: ReactNode
  readonly className?: string
  readonly external?: boolean
  readonly variant?: 'solid' | 'inverse'
}

const buttonVariant = {
  solid: 'bg-ink text-bg hover:bg-accent-strong',
  inverse: 'bg-dark-ink text-dark-bg hover:bg-accent hover:text-dark-ink',
} as const

export function PrimaryButton({
  href,
  children,
  className,
  external = false,
  variant = 'solid',
}: PrimaryButtonProps) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]',
        buttonVariant[variant],
        className,
      )}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  )
}
```

- [ ] **Step 7: Create `website/src/components/TextLink.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface TextLinkProps {
  readonly href: string
  readonly children: ReactNode
  readonly className?: string
  readonly external?: boolean
}

export function TextLink({
  href,
  children,
  className,
  external = false,
}: TextLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        'text-accent-strong underline decoration-1 underline-offset-4 transition-colors duration-[var(--dur-quick)] hover:text-ink',
        className,
      )}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  )
}
```

- [ ] **Step 8: Create `website/src/components/CornerMark.tsx`**

```tsx
import { cn } from '../lib/cn'

export function CornerMark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute h-3 w-3 border-l border-t border-line',
        className,
      )}
    />
  )
}
```

- [ ] **Step 9: Verify typecheck and lint, then commit**

Run:
```bash
pnpm -C website typecheck && pnpm -C website lint
git add website/src/components
git commit -m "feat(website): add base layout primitives"
```

---

### Task 5: Copy command interaction

**Files:**
- Create: `website/src/hooks/useCopy.ts`
- Create: `website/src/components/CopyCommand.tsx`

- [ ] **Step 1: Create `website/src/hooks/useCopy.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyState = 'idle' | 'copied' | 'error'

export function useCopy(resetAfterMs = 2000) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setState('copied')
      } catch {
        setState('error')
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), resetAfterMs)
    },
    [resetAfterMs],
  )

  return { state, copy } as const
}
```

- [ ] **Step 2: Create `website/src/components/CopyCommand.tsx`**

```tsx
import { useCopy } from '../hooks/useCopy'
import { cn } from '../lib/cn'

interface CopyCommandProps {
  readonly command: string
  readonly label?: string
  readonly className?: string
  readonly tone?: 'light' | 'dark'
}

const feedback: Record<string, string> = {
  idle: 'Copy',
  copied: 'Copied',
  error: 'Copy failed',
}

export function CopyCommand({
  command,
  label = 'Copy install command',
  className,
  tone = 'light',
}: CopyCommandProps) {
  const { state, copy } = useCopy()
  const dark = tone === 'dark'

  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-4 rounded-lg border px-4 py-3 font-mono text-mono-xs',
        dark
          ? 'border-dark-line bg-dark-surface text-dark-ink'
          : 'border-line bg-surface text-ink',
        className,
      )}
    >
      <code className="overflow-x-auto whitespace-pre">
        <span
          className={cn('select-none', dark ? 'text-dark-ink-2' : 'text-ink-3')}
        >
          ${' '}
        </span>
        {command}
      </code>
      <button
        type="button"
        onClick={() => copy(command)}
        aria-label={label}
        className={cn(
          'shrink-0 rounded border px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wider transition-colors duration-[var(--dur-quick)]',
          dark
            ? 'border-dark-line text-dark-ink-2 hover:text-dark-ink'
            : 'border-line text-ink-2 hover:text-ink',
        )}
      >
        {feedback[state] ?? 'Copy'}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Command copied to clipboard' : ''}
        {state === 'error' ? 'Copy failed' : ''}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck, lint, and build**

Run:
```bash
pnpm -C website typecheck && pnpm -C website lint && pnpm -C website build
```
Expected: all exit 0. (Copy behavior is asserted in Plan 3's Playwright suite.)

- [ ] **Step 4: Commit**

```bash
git add website/src/hooks/useCopy.ts website/src/components/CopyCommand.tsx
git commit -m "feat(website): add copy-to-clipboard install command"
```

---

### Task 6: Site shell — routes, nav, header, footer

**Files:**
- Create: `website/src/components/PageStub.tsx`
- Create: `website/src/components/NavLink.tsx`
- Create: `website/src/components/RouteRail.tsx`
- Create: `website/src/components/SiteHeader.tsx`
- Create: `website/src/components/SiteFooter.tsx`
- Create stubs: `website/src/routes/{features,docs,docs.cli,docs.troubleshooting,changelog,security}.tsx`
- Modify: `website/src/routes/__root.tsx`

- [ ] **Step 1: Create `website/src/components/PageStub.tsx`**

```tsx
import { Container } from './Container'
import { Eyebrow } from './Eyebrow'

interface PageStubProps {
  readonly eyebrow: string
  readonly title: string
}

export function PageStub({ eyebrow, title }: PageStubProps) {
  return (
    <Container className="py-[clamp(6rem,16vw,12rem)]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">{title}</h1>
      <p className="mt-6 max-w-xl text-body-lg text-ink-2">
        This page is scheduled for the next implementation plan.
      </p>
    </Container>
  )
}
```

- [ ] **Step 2: Create the six stub routes**

`website/src/routes/features.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/features')({
  component: () => <PageStub eyebrow="Features" title="What Peek does" />,
})
```

`website/src/routes/docs.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/docs')({
  component: () => <PageStub eyebrow="Docs" title="Documentation" />,
})
```

`website/src/routes/docs.cli.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/docs/cli')({
  component: () => <PageStub eyebrow="Docs" title="CLI reference" />,
})
```

`website/src/routes/docs.troubleshooting.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/docs/troubleshooting')({
  component: () => <PageStub eyebrow="Docs" title="Troubleshooting" />,
})
```

`website/src/routes/changelog.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/changelog')({
  component: () => <PageStub eyebrow="Changelog" title="Release history" />,
})
```

`website/src/routes/security.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/security')({
  component: () => <PageStub eyebrow="Security" title="Security model" />,
})
```

- [ ] **Step 3: Create `website/src/components/NavLink.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import type { LinkItem } from '../content/site'

interface NavLinkProps {
  readonly item: LinkItem
  readonly className?: string
}

/**
 * Site content is plain data, so `to` is a string rather than a route literal.
 * Route existence is enforced by the route definitions themselves; the cast
 * keeps the content declarative without weakening the router's own types.
 */
export function NavLink({ item, className }: NavLinkProps) {
  if (item.external) {
    return (
      <a
        href={item.to}
        className={className}
        target="_blank"
        rel="noreferrer"
      >
        {item.label}
      </a>
    )
  }
  return (
    <Link to={item.to as never} className={className}>
      {item.label}
    </Link>
  )
}
```

- [ ] **Step 4: Create `website/src/components/SiteHeader.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { site } from '../content/site'
import { Container } from './Container'
import { NavLink } from './NavLink'

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <Container width="wide" className="flex h-16 items-center justify-between">
        <Link
          to="/"
          className="font-mono text-sm font-medium tracking-tight text-ink"
          onClick={() => setOpen(false)}
        >
          <span className="text-accent-strong">$</span> peek
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {site.nav.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              className="font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2 transition-colors duration-[var(--dur-quick)] hover:text-ink"
            />
          ))}
        </nav>

        <div className="flex items-center gap-4 md:hidden">
          <a
            href={site.github}
            className="font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
            className="font-mono text-mono-xs uppercase tracking-[0.12em] text-ink"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </Container>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-line bg-bg md:hidden"
        >
          <Container width="wide" className="flex flex-col py-4">
            {site.nav.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                className="py-3 font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2"
              />
            ))}
          </Container>
        </nav>
      ) : null}
    </header>
  )
}
```

- [ ] **Step 5: Create `website/src/components/SiteFooter.tsx`**

```tsx
import { site } from '../content/site'
import { version } from '../content/version'
import { Container } from './Container'
import { NavLink } from './NavLink'

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container width="wide" className="py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <p className="font-mono text-sm font-medium">
              <span className="text-accent-strong">$</span> peek
            </p>
            <p className="mt-4 max-w-xs text-sm text-ink-2">{site.tagline}</p>
            <p className="mt-4 font-mono text-mono-xs text-ink-3">
              v{version} · MIT
            </p>
          </div>
          {site.footer.map((group) => (
            <div key={group.title}>
              <h2 className="font-mono text-mono-xs uppercase tracking-[0.14em] text-ink-3">
                {group.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {group.links.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      item={item}
                      className="text-sm text-ink-2 transition-colors duration-[var(--dur-quick)] hover:text-ink"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </footer>
  )
}
```

- [ ] **Step 6: Create `website/src/components/RouteRail.tsx`**

```tsx
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
  if (stops.length === 0) return null
  return (
    <nav
      aria-label="Page sections"
      className={cn('fixed left-6 top-1/2 hidden -translate-y-1/2 xl:block', className)}
    >
      <ol className="flex flex-col gap-4">
        {stops.map((stop, index) => (
          <li key={stop.id}>
            <a
              href={`#${stop.id}`}
              className="group flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3"
            >
              <span className="h-px w-4 bg-line transition-all duration-[var(--dur-quick)] group-hover:w-8 group-hover:bg-accent" />
              <span className="transition-colors duration-[var(--dur-quick)] group-hover:text-ink">
                {String(index + 1).padStart(2, '0')} {stop.label}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
```

- [ ] **Step 7: Replace `website/src/routes/__root.tsx` with the full shell**

```tsx
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { site } from '../content/site'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: `${site.name} — ${site.tagline}` },
      { name: 'description', content: site.description },
      { property: 'og:site_name', content: site.name },
      { property: 'og:type', content: 'website' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">
          <Outlet />
        </main>
        <SiteFooter />
        <Scripts />
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Build, typecheck, lint**

Run:
```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
```
Expected: all exit 0; route tree now includes the six stub routes.

- [ ] **Step 9: Commit**

```bash
git add website/src/components website/src/routes
git commit -m "feat(website): add site shell, nav, header, and footer"
```

---

### Task 7: Terminal scene state machine

**Files:**
- Create: `website/src/scenes/terminal-machine.ts`
- Test: `website/tests/unit/terminal-machine.test.ts`
- Create: `website/src/scenes/TerminalStage.tsx`

- [ ] **Step 1: Write the failing test**

`website/tests/unit/terminal-machine.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  TERMINAL_STEPS,
  nextTerminalState,
  stepIndex,
  visibleSteps,
} from '../../src/scenes/terminal-machine'

describe('terminal machine', () => {
  it('advances from idle through every step to connected', () => {
    expect(nextTerminalState('idle')).toBe('detected')
    expect(nextTerminalState('detected')).toBe('starting')
    expect(nextTerminalState('starting')).toBe('ready')
    expect(nextTerminalState('ready')).toBe('connecting')
    expect(nextTerminalState('connecting')).toBe('connected')
  })

  it('is idempotent at the terminal state', () => {
    expect(nextTerminalState('connected')).toBe('connected')
  })

  it('reports idle as index -1', () => {
    expect(stepIndex('idle')).toBe(-1)
  })

  it('reveals steps in order', () => {
    expect(visibleSteps('idle')).toHaveLength(0)
    expect(visibleSteps('ready')).toHaveLength(3)
    expect(visibleSteps('connected')).toHaveLength(TERMINAL_STEPS.length)
  })

  it('ends on a success line', () => {
    const last = TERMINAL_STEPS[TERMINAL_STEPS.length - 1]
    expect(last?.tone).toBe('success')
    expect(last?.line).toContain('Tunnel')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C website test`
Expected: FAIL — cannot find module `terminal-machine`.

- [ ] **Step 3: Write `website/src/scenes/terminal-machine.ts`**

```ts
export const TERMINAL_STATES = [
  'idle',
  'detected',
  'starting',
  'ready',
  'connecting',
  'connected',
] as const

export type TerminalState = (typeof TERMINAL_STATES)[number]

export type TerminalTone = 'muted' | 'success'

export interface TerminalStep {
  readonly state: Exclude<TerminalState, 'idle'>
  readonly line: string
  readonly tone: TerminalTone
  readonly delayMs: number
}

export const TERMINAL_STEPS: readonly TerminalStep[] = [
  { state: 'detected', line: '✓ pnpm project', tone: 'success', delayMs: 450 },
  {
    state: 'starting',
    line: '· Starting pnpm dev…',
    tone: 'muted',
    delayMs: 650,
  },
  {
    state: 'ready',
    line: '✓ Server ready on localhost:3000',
    tone: 'success',
    delayMs: 850,
  },
  {
    state: 'connecting',
    line: '· Opening tunnel…',
    tone: 'muted',
    delayMs: 600,
  },
  {
    state: 'connected',
    line: '✓ Tunnel connected',
    tone: 'success',
    delayMs: 700,
  },
]

export function stepIndex(state: TerminalState): number {
  return TERMINAL_STATES.indexOf(state) - 1
}

export function visibleSteps(state: TerminalState): readonly TerminalStep[] {
  const index = stepIndex(state)
  if (index < 0) return []
  return TERMINAL_STEPS.slice(0, index + 1)
}

export function nextTerminalState(state: TerminalState): TerminalState {
  const index = TERMINAL_STATES.indexOf(state)
  const next = TERMINAL_STATES[index + 1]
  return next ?? 'connected'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C website test`
Expected: PASS.

- [ ] **Step 5: Write `website/src/scenes/TerminalStage.tsx`**

```tsx
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TERMINAL_STEPS,
  type TerminalState,
  nextTerminalState,
  visibleSteps,
} from './terminal-machine'

const toneClass = {
  muted: 'text-dark-ink-2',
  success: 'text-success',
} as const

export function TerminalStage() {
  const reduceMotion = useReducedMotion()
  const [state, setState] = useState<TerminalState>('connected')
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPlaying(false)
  }, [])

  useEffect(() => stop, [stop])

  const play = useCallback(() => {
    stop()
    if (reduceMotion) {
      setState('connected')
      return
    }
    setState('idle')
    setPlaying(true)
    let current: TerminalState = 'idle'
    const advance = () => {
      const next = nextTerminalState(current)
      const step = TERMINAL_STEPS.find((candidate) => candidate.state === next)
      timer.current = setTimeout(() => {
        current = next
        setState(next)
        if (next === 'connected') {
          setPlaying(false)
          return
        }
        advance()
      }, step?.delayMs ?? 0)
    }
    advance()
  }, [reduceMotion, stop])

  const steps = visibleSteps(state)
  const connected = state === 'connected'

  return (
    <figure className="rounded-xl border border-dark-line bg-dark-bg p-2 shadow-2xl">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-dark-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-dark-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-dark-line" />
        <figcaption className="ml-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-dark-ink-2">
          peek — terminal
        </figcaption>
      </div>
      <div className="min-h-[13rem] rounded-lg bg-dark-surface p-4 font-mono text-mono-xs leading-relaxed text-dark-ink">
        <p>
          <span className="text-accent">$</span> peek
        </p>
        <div aria-live="polite">
          {steps.map((step) => (
            <p key={step.state} className={toneClass[step.tone]}>
              {step.line}
            </p>
          ))}
          {connected ? (
            <div className="mt-3 text-dark-ink-2">
              <p>
                <span className="text-dark-ink">Local</span>{' '}
                http://localhost:3000
              </p>
              <p>
                <span className="text-dark-ink">Public</span>{' '}
                <span className="text-accent">
                  https://quiet-harbor-4f2.peek.run
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <p className="font-mono text-[0.6875rem] text-dark-ink-2">
          Demo — hostname rotates each run.
        </p>
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="rounded border border-dark-line px-3 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-dark-ink-2 transition-colors duration-[var(--dur-quick)] hover:text-dark-ink disabled:opacity-50"
        >
          {playing ? 'Replaying…' : 'Replay'}
        </button>
      </div>
    </figure>
  )
}
```

- [ ] **Step 6: Build, typecheck, lint**

Run:
```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
```
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add website/src/scenes website/tests/unit/terminal-machine.test.ts
git commit -m "feat(website): add replayable terminal scene"
```

---

### Task 8: Hero stage — connection path, device frame, hero

**Files:**
- Create: `website/src/scenes/ConnectionPath.tsx`
- Create: `website/src/scenes/DeviceFrame.tsx`
- Create: `website/src/scenes/HeroStage.tsx`
- Create: `website/src/sections/home/HomeHero.tsx`

- [ ] **Step 1: Create `website/src/scenes/ConnectionPath.tsx`**

```tsx
import { motion, useReducedMotion } from 'motion/react'

export function ConnectionPath() {
  const reduceMotion = useReducedMotion()

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      className="hidden h-10 w-full text-line lg:block"
    >
      <line
        x1="0"
        y1="20"
        x2="200"
        y2="20"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 5"
      />
      {reduceMotion ? (
        <circle cx="100" cy="20" r="3" className="fill-accent" />
      ) : (
        <motion.circle
          cy="20"
          r="3"
          className="fill-accent"
          initial={{ cx: 0 }}
          animate={{ cx: 200 }}
          transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        />
      )}
    </svg>
  )
}
```

- [ ] **Step 2: Create `website/src/scenes/DeviceFrame.tsx`**

```tsx
export function DeviceFrame() {
  return (
    <div
      role="img"
      aria-label="A phone showing the shared preview at the public URL."
      className="mx-auto w-full max-w-[15rem] rounded-[2rem] border border-line bg-bg p-2 shadow-xl"
    >
      <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="truncate font-mono text-[0.625rem] text-ink-2">
          quiet-harbor-4f2.peek.run
        </span>
      </div>
      <div className="mt-2 space-y-2 rounded-2xl bg-surface p-3">
        <div className="h-3 w-2/3 rounded bg-line" />
        <div className="h-2 w-full rounded bg-line/70" />
        <div className="h-2 w-5/6 rounded bg-line/70" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="h-12 rounded-lg bg-line/60" />
          <div className="h-12 rounded-lg bg-line/60" />
        </div>
        <div className="h-2 w-1/2 rounded bg-accent/40" />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `website/src/scenes/HeroStage.tsx`**

```tsx
import { ConnectionPath } from './ConnectionPath'
import { DeviceFrame } from './DeviceFrame'
import { TerminalStage } from './TerminalStage'

export function HeroStage() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_auto_1fr]">
      <TerminalStage />
      <ConnectionPath />
      <DeviceFrame />
    </div>
  )
}
```

- [ ] **Step 4: Create `website/src/sections/home/HomeHero.tsx`**

```tsx
import { CopyCommand } from '../../components/CopyCommand'
import { Eyebrow } from '../../components/Eyebrow'
import { TextLink } from '../../components/TextLink'
import { site } from '../../content/site'
import { HeroStage } from '../../scenes/HeroStage'

export function HomeHero() {
  return (
    <section className="relative border-b border-line pb-[clamp(4rem,9vw,7rem)] pt-[clamp(3rem,7vw,6rem)]">
      <div className="mx-auto w-full max-w-wide px-5 sm:px-8 lg:px-12">
        <Eyebrow>Temporary previews for local development</Eyebrow>
        <h1 className="mt-5 max-w-4xl text-display font-medium text-balance">
          Run it here. Open it anywhere.
        </h1>
        <p className="mt-6 max-w-2xl text-body-lg text-pretty text-ink-2">
          Peek starts your dev server, checks that the port it found is the port
          it owns, and opens a temporary HTTPS link. No account, no config, no
          cloudflared install.
        </p>

        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center">
          <CopyCommand command={site.install.pnpm} />
          <TextLink href={site.npm} external>
            or install from npm
          </TextLink>
        </div>

        <div className="mt-12">
          <HeroStage />
        </div>

        <p className="mt-8 font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-3">
          Public preview · Development only · No uptime guarantee · Hostname
          changes each run
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Build, typecheck, lint, then commit**

```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
git add website/src/scenes website/src/sections
git commit -m "feat(website): add hero stage with terminal, path, and device"
```

---

### Task 9: Homepage sections — one command, connection story, share intent

**Files:**
- Create: `website/src/sections/home/OneCommand.tsx`
- Create: `website/src/sections/home/ConnectionStory.tsx`
- Create: `website/src/sections/home/ShareIntent.tsx`

- [ ] **Step 1: Create `website/src/sections/home/OneCommand.tsx`**

```tsx
import { Container } from '../../components/Container'
import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'
import { site } from '../../content/site'
import { CopyCommand } from '../../components/CopyCommand'

const steps = [
  { title: 'Install once', detail: 'One global install. Peek fetches its own cloudflared.' },
  { title: 'Run peek', detail: 'No flags for the normal case. Peek reads your dev script.' },
  { title: 'Send the link', detail: 'A temporary HTTPS URL, ready in seconds.' },
] as const

export function OneCommand() {
  return (
    <Section id="one-command" tone="surface">
      <Eyebrow>One command</Eyebrow>
      <SectionHeading className="mt-4">
        Nothing to configure.
      </SectionHeading>
      <p className="mt-6 max-w-2xl text-body-lg text-ink-2">
        Peek looks at the project you are in, finds the dev script, starts it on
        the port it actually binds, and waits until that port answers before it
        shares anything.
      </p>

      <div className="mt-10 max-w-xl">
        <CopyCommand command={site.install.pnpm} />
      </div>

      <ol className="mt-14 grid gap-10 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <p className="font-mono text-mono-xs text-accent-strong">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h3 className="mt-3 text-h3 font-medium">{step.title}</h3>
            <p className="mt-2 text-ink-2">{step.detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
```

- [ ] **Step 2: Create `website/src/sections/home/ConnectionStory.tsx`**

```tsx
import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'

const stages = [
  {
    label: 'Here',
    title: 'Your machine',
    detail: 'Peek runs in the project directory and never leaves it.',
  },
  {
    label: 'Verified',
    title: 'The port you own',
    detail: 'Peek confirms the responding port belongs to the process it started.',
  },
  {
    label: 'There',
    title: 'A link you can send',
    detail: 'Traffic reaches your app through a loopback proxy that rechecks ownership.',
  },
] as const

export function ConnectionStory() {
  return (
    <Section id="how-it-works" tone="dark" className="overflow-hidden">
      <Eyebrow tone="dark">The route</Eyebrow>
      <SectionHeading className="mt-4">
        From localhost to a link you can send.
      </SectionHeading>

      <ol className="mt-16 grid gap-px overflow-hidden rounded-xl bg-dark-line md:grid-cols-3">
        {stages.map((stage) => (
          <li key={stage.label} className="bg-dark-bg p-8">
            <p className="font-mono text-mono-xs uppercase tracking-[0.14em] text-accent">
              {stage.label}
            </p>
            <h3 className="mt-4 text-h3 font-medium">{stage.title}</h3>
            <p className="mt-3 text-dark-ink-2">{stage.detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
```

- [ ] **Step 3: Create `website/src/sections/home/ShareIntent.tsx`**

```tsx
import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'
import { composePeekCommand } from '../../content/commands'

const modes = [
  {
    name: 'Public',
    command: composePeekCommand({}),
    detail: 'Anyone with the link can open the preview.',
    note: null,
  },
  {
    name: 'Password',
    command: composePeekCommand({ password: true }),
    detail: 'HTTP Basic auth runs in the local proxy.',
    note: 'Peek removes the credential before the request reaches your app, so your app must not rely on the Authorization header.',
  },
  {
    name: 'Private',
    command: composePeekCommand({ private: true }),
    detail: 'No public tunnel at all. Only your machine can reach it.',
    note: 'Peek does not rebind your app; it stops the tunnel and keeps the local URL.',
  },
] as const

export function ShareIntent() {
  return (
    <Section id="sharing">
      <Eyebrow>Sharing</Eyebrow>
      <SectionHeading className="mt-4">
        Share the way the moment needs.
      </SectionHeading>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {modes.map((mode) => (
          <article
            key={mode.name}
            className="flex flex-col rounded-xl border border-line p-6"
          >
            <h3 className="text-h3 font-medium">{mode.name}</h3>
            <p className="mt-3 text-ink-2">{mode.detail}</p>
            <code className="mt-5 overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-mono-xs">
              {mode.command}
            </code>
            {mode.note ? (
              <p className="mt-4 text-sm text-ink-3">{mode.note}</p>
            ) : null}
          </article>
        ))}
      </div>
    </Section>
  )
}
```

- [ ] **Step 4: Build, typecheck, lint, then commit**

```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
git add website/src/sections/home
git commit -m "feat(website): add one-command, connection, and sharing sections"
```

---

### Task 10: Homepage sections — real development, transparency, sign-off

**Files:**
- Create: `website/src/sections/home/RealDevelopment.tsx`
- Create: `website/src/sections/home/Transparency.tsx`
- Create: `website/src/sections/home/Signoff.tsx`

- [ ] **Step 1: Create `website/src/sections/home/RealDevelopment.tsx`**

```tsx
import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'

const points = [
  {
    title: 'Hot reload survives the tunnel',
    detail:
      'Peek preserves HTTP framing and proxies WebSocket upgrades, so the preview behaves like your local tab.',
  },
  {
    title: 'Shutdown is deterministic',
    detail:
      'The dev server and the tunnel stop together, and Peek tells you the concrete reason if it cannot confirm every child exited.',
  },
  {
    title: 'Bounded output',
    detail:
      'Dev-server and tunnel output is buffered and streamed, so a chatty build cannot balloon memory.',
  },
] as const

export function RealDevelopment() {
  return (
    <Section id="development" tone="surface">
      <Eyebrow>Real development</Eyebrow>
      <SectionHeading className="mt-4">
        Built for the loop you already use.
      </SectionHeading>
      <ul className="mt-14 grid gap-10 md:grid-cols-3">
        {points.map((point) => (
          <li key={point.title}>
            <h3 className="text-h3 font-medium">{point.title}</h3>
            <p className="mt-3 text-ink-2">{point.detail}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
```

- [ ] **Step 2: Create `website/src/sections/home/Transparency.tsx`**

```tsx
import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'
import { TextLink } from '../../components/TextLink'

const limits = [
  {
    label: 'Dev only',
    detail: 'Peek is for development previews. It is not production hosting.',
  },
  {
    label: 'No uptime promise',
    detail: 'Quick Tunnel links are temporary and can drop.',
  },
  {
    label: 'Rotating hostname',
    detail: 'Every run gets a new random hostname.',
  },
  {
    label: 'No server-sent events',
    detail: 'SSE does not stream through the proxy today.',
  },
  {
    label: 'Protected previews',
    detail:
      'Basic auth consumes the Authorization header before your app sees the request.',
  },
  {
    label: 'No account, no telemetry',
    detail: 'Peek collects no source code, no environment variables, and no usage data.',
  },
] as const

export function Transparency() {
  return (
    <Section id="limits">
      <Eyebrow>Straight answers</Eyebrow>
      <SectionHeading className="mt-4">Know what Peek is doing.</SectionHeading>
      <p className="mt-6 max-w-2xl text-body-lg text-ink-2">
        Peek shows the access mode, the expiry, and the reason a preview is
        unreachable. Here are the limits worth knowing before you share a link.
      </p>

      <dl className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {limits.map((limit) => (
          <div key={limit.label} className="bg-bg p-6">
            <dt className="font-mono text-mono-xs uppercase tracking-[0.14em] text-accent-strong">
              {limit.label}
            </dt>
            <dd className="mt-3 text-ink-2">{limit.detail}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-ink-2">
        Read the <TextLink href="/security">security model</TextLink> or the{' '}
        <TextLink href="/docs/troubleshooting">troubleshooting guide</TextLink>.
      </p>
    </Section>
  )
}
```

- [ ] **Step 3: Create `website/src/sections/home/Signoff.tsx`**

```tsx
import { CopyCommand } from '../../components/CopyCommand'
import { PrimaryButton } from '../../components/PrimaryButton'
import { Section } from '../../components/Section'
import { site } from '../../content/site'

export function Signoff() {
  return (
    <Section id="start" tone="dark" className="text-center">
      <h2 className="mx-auto max-w-2xl text-h2 font-medium text-balance">
        Run your dev server. Share it instantly.
      </h2>
      <div className="mx-auto mt-8 max-w-md">
        <CopyCommand command={site.install.pnpm} tone="dark" />
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <PrimaryButton href="/docs" variant="inverse">
          Read the docs
        </PrimaryButton>
        <a
          href={site.github}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-mono-xs uppercase tracking-[0.14em] text-dark-ink-2 hover:text-dark-ink"
        >
          Star on GitHub
        </a>
      </div>
    </Section>
  )
}
```

- [ ] **Step 4: Build, typecheck, lint, then commit**

```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
git add website/src/sections/home
git commit -m "feat(website): add development, transparency, and sign-off sections"
```

---

### Task 11: Assemble the homepage and verify

**Files:**
- Create: `website/src/sections/home/HomePage.tsx`
- Modify: `website/src/routes/index.tsx`

- [ ] **Step 1: Create `website/src/sections/home/HomePage.tsx`**

```tsx
import { RouteRail } from '../../components/RouteRail'
import { ConnectionStory } from './ConnectionStory'
import { HomeHero } from './HomeHero'
import { OneCommand } from './OneCommand'
import { RealDevelopment } from './RealDevelopment'
import { ShareIntent } from './ShareIntent'
import { Signoff } from './Signoff'
import { Transparency } from './Transparency'

const railStops = [
  { id: 'one-command', label: 'One command' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'development', label: 'Development' },
  { id: 'limits', label: 'Limits' },
  { id: 'start', label: 'Start' },
] as const

export function HomePage() {
  return (
    <>
      <RouteRail stops={railStops} />
      <HomeHero />
      <OneCommand />
      <ConnectionStory />
      <ShareIntent />
      <RealDevelopment />
      <Transparency />
      <Signoff />
    </>
  )
}
```

- [ ] **Step 2: Replace `website/src/routes/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '../sections/home/HomePage'
import { absoluteUrl } from '../content/site'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Peek — Run your dev server. Share it instantly.' },
      {
        name: 'description',
        content:
          'Peek starts your dev server, verifies the port, and opens a temporary HTTPS preview. No account, no config.',
      },
      {
        property: 'og:title',
        content: 'Peek — Run your dev server. Share it instantly.',
      },
      {
        property: 'og:description',
        content:
          'Temporary HTTPS previews for local development. No account, no config, no cloudflared install.',
      },
      { property: 'og:url', content: absoluteUrl('/') },
    ],
    links: [{ rel: 'canonical', href: absoluteUrl('/') }],
  }),
  component: HomePage,
})
```

- [ ] **Step 3: Verify the full website gate**

Run:
```bash
pnpm -C website test
pnpm -C website typecheck
pnpm -C website lint
pnpm -C website build
```
Expected: all exit 0; `website/.output` contains prerendered HTML for `/` and every stub route.

- [ ] **Step 4: Verify prerendered output contains real content**

Run:
```bash
find website/.output -name '*.html' -print0 | xargs -0 grep -l 'Run it here. Open it anywhere.'
```
Expected: prints the path of the prerendered homepage HTML. (This proves the homepage is static, not client-only.)

- [ ] **Step 5: Verify the root CLI is untouched**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: all root checks pass.

- [ ] **Step 6: Commit**

```bash
git add website
git commit -m "feat(website): assemble the homepage"
```

---

## Plan 2 and Plan 3 outline (to be written next)

**Plan 2 — Docs pipeline and secondary routes:**
- Build-time Markdown adapters: read root `docs/*.md` and `CHANGELOG.md`, parse with a front-matter-free convention, and render at build time with `remark`/`rehype` + `shiki`.
- `src/content/changelog.ts` (parse `## x.y.z — date` headings into releases) with Vitest coverage; `src/content/docs.ts` manifest.
- Real `/features`, `/docs`, `/docs/cli`, `/docs/troubleshooting`, `/changelog`, `/security` pages replacing the stubs.
- `notFoundComponent` 404 route; sitemap and `robots.txt`; enable `crawlLinks: true`.

**Plan 3 — Motion, QA, CI, deploy, PR:**
- Scroll-reveal and rail active-state motion, all behind `useReducedMotion()`.
- Playwright suite: copy feedback, mobile nav, terminal replay, reduced-motion mode, no horizontal overflow at 360/768/1440, keyboard-only nav.
- Screenshot set and light a11y pass (headings, landmarks, contrast, focus order).
- `.github/workflows/website.yml` filtered to `website/**` and the spec/plan docs; no Cloudflare network in CI.
- Cloudflare Workers deploy via `@cloudflare/vite-plugin` + `wrangler`; documented in `website/README.md`.
- Final antislop audit, root gate, push `feat/marketing-website`, open the PR.
