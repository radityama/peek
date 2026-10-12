# Peek Marketing Website — Docs Pipeline & Secondary Routes Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the website a build-time Markdown pipeline and replace every Plan 1 stub route with a real page, ending with a static 404, sitemap, and full link crawling.

**Architecture:** Root repository Markdown (`docs/CLI.md`, `docs/TROUBLESHOOTING.md`, `docs/SECURITY.md`, `CHANGELOG.md`) is imported as raw text at build time and rendered to HTML by Unified (remark → rehype → shiki). Rendering happens in `createServerFn` handlers rather than directly in route loaders, because TanStack Start loaders are isomorphic and would otherwise ship the whole Markdown toolchain to the browser. Rendering runs once at prerender, so the client ships no Markdown parser. Pure parsing lives in `src/content` and `src/lib` and is unit-tested.

**Tech Stack:** Adds `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-slug`, `rehype-autolink-headings`, `rehype-stringify`, `@shikijs/rehype`, `github-slugger`, `mdast-util-to-string`, `unist-util-visit` to the `website/` package from Plan 1.

**Spec:** `docs/superpowers/specs/2026-10-12-peek-marketing-website-design.md`
**Depends on:** Plan 1 (`docs/superpowers/plans/2026-10-12-marketing-website-foundation.md`) must be fully implemented.

---

## File structure (created or changed by this plan)

```
website/
├── package.json                          # + markdown dependencies
├── vite.config.ts                        # + server.fs.allow for ../docs
├── src/
│   ├── content/
│   │   ├── changelog.ts                  # parseChangelog()
│   │   ├── docs.ts                       # doc manifest + raw imports + docsNav
│   │   └── sources.server.ts             # raw imports of CHANGELOG.md + SECURITY.md
│   ├── lib/
│   │   ├── headings.ts                   # DocumentHeading type (client-safe)
│   │   ├── markdown.server.ts            # renderMarkdown(), extractHeadings()
│   │   ├── docs-render.ts                # createServerFn wrappers
│   │   └── sitemap.ts                    # sitemapPaths, buildSitemapXml(), buildRobotsTxt()
│   ├── components/
│   │   ├── Prose.tsx                     # .prose wrapper
│   │   ├── DocsNav.tsx                   # docs sidebar / on-this-page
│   │   ├── DocLayout.tsx                 # shared docs page layout
│   │   └── NotFound.tsx
│   ├── routes/
│   │   ├── __root.tsx                    # + notFoundComponent
│   │   ├── docs.tsx                      # real index (was stub)
│   │   ├── docs_.cli.tsx                 # real page (was stub)
│   │   ├── docs_.troubleshooting.tsx     # real page (was stub)
│   │   ├── changelog.tsx                 # real page (was stub)
│   │   ├── features.tsx                  # real page (was stub)
│   │   └── security.tsx                  # real page (was stub)
│   └── styles/
│       └── prose.css                     # imported by app.css
└── tests/unit/
    ├── changelog.test.ts
    ├── markdown.test.ts
    ├── docs.test.ts
    └── sitemap.test.ts
```

`sitemap.xml` and `robots.txt` are emitted at build time by a small Vite plugin
rather than committed to `public/`, so their absolute URLs always match the
deployed origin.

---

## Implementation deviations (decided during execution)

These supersede the inline code samples below wherever they conflict. Each was
forced by something the plan could not know until it ran.

1. **Markdown renders behind `createServerFn`, not in loaders.** TanStack Start
   loaders run on both the server and the client, so importing the renderer from
   a loader would ship `unified`, `shiki`, and every remark/rehype plugin in the
   browser bundle. The renderer therefore lives in
   `src/lib/markdown.server.ts` (pruned from client builds) and routes call thin
   `createServerFn` wrappers exported from `src/lib/docs-render.ts`. Read every
   `import { renderMarkdown } from '../lib/markdown'` below as
   `import { renderDoc } from '../lib/docs-render'` plus
   `renderDoc({ data: slug })`. `src/lib/headings.ts` holds the
   `DocumentHeading` type so client components never import a server module.

2. **The docs routes are siblings, not nested.** Flat-file nesting makes
   `docs.tsx` a *layout* route the moment `docs.cli.tsx` exists, and prerender
   then also emits a bare `/docs` that renders an empty `<Outlet/>`. A trailing
   `_` on the path segment opts out of that nesting (TanStack's documented
   escape hatch, cf. `posts_.$postId.edit.tsx`), so the two reference pages are
   `docs_.cli.tsx` and `docs_.troubleshooting.tsx`, each parented to the root
   route, and `docs.tsx` stays a plain page at `/docs`.

3. **A leading `# Title` is stripped before rendering.** Every docs page already
   renders its own `h1` from the layout, so an unstripped source heading produced
   two identical `<h1>`s. `stripLeadingTitle` runs in both `renderMarkdown` and
   `extractHeadings` so the on-this-page anchors match the rendered slugs.

4. **Prerender verification must ignore dehydrated loader data.** The generated
   HTML embeds the loader result as JSON, so a plain `grep` for body text passes
   even when the visible DOM is wrong. Strip `<script>…</script>` before checking
   (this is exactly how the duplicate-`/docs` bug hid during Task 4).

5. **The changelog page renders through `renderChangelog`, not the loader body
   in Task 5's snippet.** Same rule as deviation 1: the parser and Markdown
   renderer live in `docs-render.ts` wrappers so the route only calls a server
   function.

6. **`docsNav` was renamed to `docsManifest`, and the sidebar moved to
   `docsSidebar`.** `/security` renders `docs/SECURITY.md` outside the manifest,
   so reusing `docsNav` as the sidebar list would leave nothing highlighted on
   that page. `docsManifest` keeps the source-bearing entries (`docs.test.ts`
   still asserts their hrefs live under `/docs`), and `docsSidebar` adds the
   authored `/docs` and `/security` links.

7. **The features page uses a real `h1`.** Task 6's snippet used
   `SectionHeading`, which renders an `h2`; as the page's only title that would
   leave the page with no `h1` at all (axe `page-has-heading-one`). The feature
   tiles keep their `h2`s.

8. **The Vite config imports `./src/lib/sitemap.ts` with the extension.** Vite
   warns that an extensionless import is unsupported by the `native` config
   loader that is planned to become the default, so `tsconfig.json` sets
   `allowImportingTsExtensions: true` (valid because the project is `noEmit`).

9. **`seoAssets` emits in the client environment only.** `generateBundle` runs
   once per environment, so without the `this.environment.config.consumer`
   guard `dist/server/` also received a copy of both files — dead weight in the
   Worker bundle.

10. **`sitemap.xml` and the prerendered pages are checked against each other by
    `scripts/check-sitemap.mjs`, wired as `postbuild`.** A hand-maintained path
    list only stays correct if something verifies it; a build that advertises a
    page it did not generate (or omits one it did) now fails instead of shipping.

---

### Task 1: Changelog parser

**Files:**
- Create: `website/src/content/changelog.ts`
- Test: `website/tests/unit/changelog.test.ts`

- [ ] **Step 1: Write the failing test**

`website/tests/unit/changelog.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseChangelog } from '../../src/content/changelog'

const fixture = `# Changelog

## 0.3.0 — 2026-10-10

- First change.
- Second change.

## 0.2.0 — 2026-09-27

- Older change.
`

describe('parseChangelog', () => {
  it('ignores the document title', () => {
    const releases = parseChangelog(fixture)
    expect(releases).toHaveLength(2)
    expect(releases[0]?.version).toBe('0.3.0')
  })

  it('captures the date', () => {
    expect(parseChangelog(fixture)[0]?.date).toBe('2026-10-10')
  })

  it('keeps the markdown body without the heading line', () => {
    const body = parseChangelog(fixture)[0]?.body ?? ''
    expect(body).toContain('- First change.')
    expect(body).not.toContain('## 0.3.0')
  })

  it('handles a release with no date', () => {
    const releases = parseChangelog('## 1.0.0\n\n- Note.\n')
    expect(releases[0]?.date).toBeNull()
  })

  it('parses the real changelog newest-first, matching the package version', () => {
    const source = readFileSync(
      new URL('../../../CHANGELOG.md', import.meta.url),
      'utf8',
    )
    const pkg = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    const releases = parseChangelog(source)
    expect(releases.length).toBeGreaterThan(3)
    expect(releases[0]?.version).toBe(pkg.version)
    expect(releases.every((release) => release.body.length > 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C website test`
Expected: FAIL — cannot find module `changelog`.

- [ ] **Step 3: Write `website/src/content/changelog.ts`**

```ts
export interface ChangelogRelease {
  readonly version: string
  readonly date: string | null
  readonly body: string
}

const RELEASE_HEADING = /^##\s+(\S+?)(?:\s+[—–-]\s+(\d{4}-\d{2}-\d{2}))?\s*$/

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let current: { version: string; date: string | null; lines: string[] } | null =
    null

  const flush = () => {
    if (!current) return
    releases.push({
      version: current.version,
      date: current.date,
      body: current.lines.join('\n').trim(),
    })
  }

  for (const line of markdown.split(/\r?\n/)) {
    const match = RELEASE_HEADING.exec(line)
    if (match) {
      flush()
      current = { version: match[1] ?? '', date: match[2] ?? null, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()

  return releases
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C website test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/content/changelog.ts website/tests/unit/changelog.test.ts
git commit -m "feat(website): parse the changelog at build time"
```

---

### Task 2: Markdown renderer

**Files:**
- Modify: `website/package.json` (add dependencies)
- Modify: `website/vite.config.ts` (`server.fs.allow`)
- Create: `website/src/lib/markdown.server.ts` (see deviation 1)
- Test: `website/tests/unit/markdown.test.ts`

- [ ] **Step 1: Add the markdown dependencies**

Run:
```bash
pnpm -C website add unified remark-parse remark-gfm remark-rehype rehype-slug rehype-autolink-headings rehype-stringify @shikijs/rehype github-slugger mdast-util-to-string unist-util-visit
pnpm -C website add -D @types/mdast @types/hast
```
Expected: `website/package.json` gains the dependencies and `website/pnpm-lock.yaml` updates.

- [ ] **Step 2: Allow the website dev server to read the root `docs/` directory**

The website lives in `website/` but imports Markdown from `../docs`. Vite's dev
server blocks files outside the project root by default, so widen the allow list
to the repository root only.

In `website/vite.config.ts`, change the `server` line to:

```ts
  server: { port: 3001, fs: { allow: ['..'] } },
```

- [ ] **Step 3: Write the failing test**

`website/tests/unit/markdown.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { extractHeadings, renderMarkdown } from '../../src/lib/markdown'

describe('renderMarkdown', () => {
  it('renders a heading with a slug id', async () => {
    const html = await renderMarkdown('## Install it\n')
    expect(html).toContain('<h2 id="install-it">')
  })

  it('renders gfm tables', async () => {
    const html = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
  })

  it('escapes raw html instead of executing it', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>\n')
    expect(html).not.toContain('<script>')
  })

  it('highlights fenced code', async () => {
    const html = await renderMarkdown('```sh\npeek\n```\n')
    expect(html).toContain('shiki')
  })
})

describe('extractHeadings', () => {
  it('returns depth, text, and slugified id in order', () => {
    const headings = extractHeadings('# One\n\n## Two words\n\n### Three\n')
    expect(headings).toEqual([
      { depth: 1, text: 'One', id: 'one' },
      { depth: 2, text: 'Two words', id: 'two-words' },
      { depth: 3, text: 'Three', id: 'three' },
    ])
  })

  it('de-duplicates repeated headings like rehype-slug', () => {
    const headings = extractHeadings('## Same\n\n## Same\n')
    expect(headings.map((heading) => heading.id)).toEqual(['same', 'same-1'])
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm -C website test`
Expected: FAIL — cannot find module `markdown`.

- [ ] **Step 5: Write `website/src/lib/markdown.ts`**

```ts
import rehypeShiki from '@shikijs/rehype'
import GithubSlugger from 'github-slugger'
import type { Heading, Root } from 'mdast'
import { toString } from 'mdast-util-to-string'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

export interface DocumentHeading {
  readonly depth: number
  readonly text: string
  readonly id: string
}

/**
 * Renders repository Markdown to HTML once, at build time. Raw HTML in the
 * source is dropped by remark-rehype (no rehype-raw), so the output only
 * contains nodes this pipeline created.
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: { className: 'heading-anchor', ariaHidden: true, tabIndex: -1 },
      content: { type: 'text', value: '#' },
    })
    .use(rehypeShiki, { theme: 'github-light' })
    .use(rehypeStringify)
    .process(markdown)
  return String(file)
}

export function extractHeadings(markdown: string): DocumentHeading[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  const slugger = new GithubSlugger()
  const headings: DocumentHeading[] = []
  visit(tree, 'heading', (node: Heading) => {
    const text = toString(node)
    headings.push({ depth: node.depth, text, id: slugger.slug(text) })
  })
  return headings
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm -C website test`
Expected: PASS. If the fenced-code assertion fails, run
`pnpm -C website add -D shiki` and confirm `@shikijs/rehype` resolves its peer.

- [ ] **Step 7: Commit**

```bash
git add website/package.json website/pnpm-lock.yaml website/vite.config.ts website/src/lib/markdown.server.ts website/tests/unit/markdown.test.ts
git commit -m "feat(website): render markdown at build time with shiki"
```

---

### Task 3: Docs manifest, prose styles, and layout

**Files:**
- Create: `website/src/content/docs.ts`
- Create: `website/src/styles/prose.css`
- Modify: `website/src/styles/app.css` (import prose)
- Create: `website/src/components/Prose.tsx`
- Create: `website/src/components/DocsNav.tsx`
- Create: `website/src/components/DocLayout.tsx`
- Create: `website/src/components/NotFound.tsx`
- Test: `website/tests/unit/docs.test.ts`

- [ ] **Step 1: Write the failing test**

`website/tests/unit/docs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { docsNav, findDoc } from '../../src/content/docs'

describe('docs manifest', () => {
  it('exposes unique hrefs under /docs', () => {
    const hrefs = docsNav.map((entry) => entry.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs.every((href) => href.startsWith('/docs'))).toBe(true)
  })

  it('imports non-empty source for every entry', () => {
    for (const entry of docsNav) {
      expect(entry.source.trim().length).toBeGreaterThan(0)
    }
  })

  it('finds an entry by slug', () => {
    expect(findDoc('cli')?.title).toBe('CLI reference')
    expect(findDoc('missing')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C website test`
Expected: FAIL — cannot find module `docs`.

- [ ] **Step 3: Write `website/src/content/docs.ts`**

```ts
import cliSource from '../../../docs/CLI.md?raw'
import troubleshootingSource from '../../../docs/TROUBLESHOOTING.md?raw'

export interface DocEntry {
  readonly slug: string
  readonly href: string
  readonly title: string
  readonly description: string
  readonly source: string
}

export const docsNav: readonly DocEntry[] = [
  {
    slug: 'cli',
    href: '/docs/cli',
    title: 'CLI reference',
    description: 'Every flag, exit status, and diagnostic Peek prints.',
    source: cliSource,
  },
  {
    slug: 'troubleshooting',
    href: '/docs/troubleshooting',
    title: 'Troubleshooting',
    description: 'Why a preview is unreachable, and what to do about it.',
    source: troubleshootingSource,
  },
]

export function findDoc(slug: string): DocEntry | undefined {
  return docsNav.find((entry) => entry.slug === slug)
}
```

- [ ] **Step 4: Write `website/src/styles/prose.css`**

```css
.prose {
  color: var(--color-ink-2);
  font-size: 1rem;
  line-height: 1.7;
}

.prose > :where(* + *) {
  margin-top: 1.1em;
}

.prose :where(h2) {
  margin-top: 2.4em;
  color: var(--color-ink);
  font-size: var(--text-h3);
  font-weight: 500;
  line-height: 1.2;
}

.prose :where(h3) {
  margin-top: 1.8em;
  color: var(--color-ink);
  font-size: 1.05rem;
  font-weight: 500;
}

.prose :where(h2, h3) > .heading-anchor {
  margin-left: 0.5ch;
  color: var(--color-line);
  text-decoration: none;
}

.prose :where(h2, h3) > .heading-anchor:focus-visible {
  color: var(--color-accent);
}

.prose :where(a) {
  color: var(--color-accent-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.prose :where(ul, ol) {
  padding-left: 1.2em;
}

.prose :where(li) {
  margin-top: 0.35em;
}

.prose :where(ul) {
  list-style: disc;
}

.prose :where(ol) {
  list-style: decimal;
}

.prose :where(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
}

.prose :where(:not(pre) > code) {
  border: 1px solid var(--color-line);
  border-radius: 0.3em;
  padding: 0.1em 0.35em;
  background-color: var(--color-surface);
}

.prose :where(pre) {
  overflow-x: auto;
  border: 1px solid var(--color-line);
  border-radius: 0.6rem;
  padding: 1rem 1.1rem;
  font-size: 0.85rem;
  line-height: 1.55;
}

.prose :where(blockquote) {
  border-left: 2px solid var(--color-accent);
  padding-left: 1rem;
  color: var(--color-ink-2);
}

.prose :where(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.prose :where(th, td) {
  border-bottom: 1px solid var(--color-line);
  padding: 0.55rem 0.75rem;
  text-align: left;
}

.prose :where(th) {
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.prose :where(hr) {
  border: 0;
  border-top: 1px solid var(--color-line);
}
```

- [ ] **Step 5: Import the prose stylesheet**

In `website/src/styles/app.css`, add `@import './prose.css';` immediately after
`@import './tokens.css';`.

- [ ] **Step 6: Create `website/src/components/Prose.tsx`**

```tsx
import { cn } from '../lib/cn'

interface ProseProps {
  readonly html: string
  readonly className?: string
}

/**
 * Injects HTML produced by `renderMarkdown`. The input is trusted repository
 * Markdown rendered at build time; no user-supplied or runtime content reaches
 * this component.
 */
export function Prose({ html, className }: ProseProps) {
  return (
    <div className={cn('prose', className)}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: build-time trusted docs */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
```

- [ ] **Step 7: Create `website/src/components/DocsNav.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { docsNav } from '../content/docs'
import type { DocumentHeading } from '../lib/markdown'

interface DocsNavProps {
  readonly currentHref: string
  readonly headings?: readonly DocumentHeading[]
}

export function DocsNav({ currentHref, headings = [] }: DocsNavProps) {
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-8">
      <ul className="flex flex-col gap-2">
        {docsNav.map((entry) => {
          const active = entry.href === currentHref
          return (
            <li key={entry.href}>
              <Link
                to={entry.href as never}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'font-mono text-mono-xs uppercase tracking-[0.12em] text-accent-strong'
                    : 'font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2 hover:text-ink'
                }
              >
                {entry.title}
              </Link>
            </li>
          )
        })}
      </ul>

      {headings.length > 0 ? (
        <div>
          <p className="font-mono text-mono-xs uppercase tracking-[0.14em] text-ink-3">
            On this page
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {headings
              .filter((heading) => heading.depth === 2)
              .map((heading) => (
                <li key={heading.id}>
                  <a
                    href={`#${heading.id}`}
                    className="text-sm text-ink-2 hover:text-ink"
                  >
                    {heading.text}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </nav>
  )
}
```

- [ ] **Step 8: Create `website/src/components/DocLayout.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Container } from './Container'
import { DocsNav } from './DocsNav'
import { Eyebrow } from './Eyebrow'
import type { DocumentHeading } from '../lib/markdown'

interface DocLayoutProps {
  readonly eyebrow: string
  readonly title: string
  readonly intro?: string
  readonly currentHref: string
  readonly headings?: readonly DocumentHeading[]
  readonly children: ReactNode
}

export function DocLayout({
  eyebrow,
  title,
  intro,
  currentHref,
  headings,
  children,
}: DocLayoutProps) {
  return (
    <Container width="wide" className="py-[clamp(3rem,7vw,5rem)]">
      <div className="grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DocsNav currentHref={currentHref} headings={headings} />
        </aside>
        <div className="min-w-0 max-w-3xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 text-h2 font-medium text-balance">{title}</h1>
          {intro ? (
            <p className="mt-5 text-body-lg text-ink-2">{intro}</p>
          ) : null}
          <div className="mt-10">{children}</div>
        </div>
      </div>
    </Container>
  )
}
```

- [ ] **Step 9: Create `website/src/components/NotFound.tsx`**

```tsx
import { TextLink } from './TextLink'
import { Container } from './Container'
import { Eyebrow } from './Eyebrow'

export function NotFound() {
  return (
    <Container className="py-[clamp(6rem,18vw,14rem)]">
      <Eyebrow>404</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">
        This route does not exist.
      </h1>
      <p className="mt-6 max-w-xl text-body-lg text-ink-2">
        The link may be old, or the page may not be written yet. Start from the{' '}
        <TextLink href="/">homepage</TextLink> or the{' '}
        <TextLink href="/docs">documentation</TextLink>.
      </p>
    </Container>
  )
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm -C website test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add website/src/content/docs.ts website/src/styles website/src/components website/tests/unit/docs.test.ts
git commit -m "feat(website): add docs manifest, prose styles, and layout"
```

---

### Task 4: Real docs routes

**Files:**
- Modify: `website/src/routes/docs.tsx`
- Rename: `website/src/routes/docs.cli.tsx` → `website/src/routes/docs_.cli.tsx`
- Rename: `website/src/routes/docs.troubleshooting.tsx` → `website/src/routes/docs_.troubleshooting.tsx`

> The `_` suffix is required: without it `docs.tsx` becomes a layout route and
> prerender emits a second, empty `/docs`. See deviation 2 above.

- [ ] **Step 1: Replace `website/src/routes/docs_.cli.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DocLayout } from '../components/DocLayout'
import { Prose } from '../components/Prose'
import { TextLink } from '../components/TextLink'
import { renderDoc } from '../lib/docs-render'

export const Route = createFileRoute('/docs/cli')({
  head: () => ({
    meta: [{ title: 'CLI reference — Peek' }],
  }),
  loader: () => renderDoc({ data: 'cli' }),
  component: () => {
    const { html, headings } = Route.useLoaderData()
    return (
      <DocLayout
        eyebrow="Docs"
        title="CLI reference"
        intro="Every flag, exit status, and diagnostic Peek prints."
        currentHref="/docs/cli"
        headings={headings}
      >
        <Prose html={html} />
        <p className="mt-12 text-ink-2">
          Stuck on an error? See the{' '}
          <TextLink href="/docs/troubleshooting">troubleshooting guide</TextLink>
          .
        </p>
      </DocLayout>
    )
  },
})
```

- [ ] **Step 2: Replace `website/src/routes/docs.troubleshooting.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DocLayout } from '../components/DocLayout'
import { Prose } from '../components/Prose'
import { findDoc } from '../content/docs'
import { renderDoc } from '../lib/docs-render'

export const Route = createFileRoute('/docs/troubleshooting')({
  head: () => ({
    meta: [{ title: 'Troubleshooting — Peek' }],
  }),
  loader: () => renderDoc({ data: 'troubleshooting' }),
  component: () => {
    const { html, headings } = Route.useLoaderData()
    return (
      <DocLayout
        eyebrow="Docs"
        title="Troubleshooting"
        intro="Why a preview is unreachable, and what to do about it."
        currentHref="/docs/troubleshooting"
        headings={headings}
      >
        <Prose html={html} />
      </DocLayout>
    )
  },
})
```

- [ ] **Step 3: Replace `website/src/routes/docs.tsx` with an authored quick start**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Container } from '../components/Container'
import { CopyCommand } from '../components/CopyCommand'
import { Eyebrow } from '../components/Eyebrow'
import { TextLink } from '../components/TextLink'
import { site } from '../content/site'

export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'Documentation — Peek' },
      {
        name: 'description',
        content: 'Install Peek, run your dev server, and share a temporary preview.',
      },
    ],
  }),
  component: DocsIndex,
})

const steps = [
  {
    title: 'Install',
    body: 'Peek needs Node.js 22 or newer. Install it once, globally.',
  },
  {
    title: 'Run it in a project',
    body: 'Peek reads your dev script and starts it on the port it actually binds.',
  },
  {
    title: 'Send the link',
    body: 'Peek waits for the port to answer, then opens a temporary HTTPS URL.',
  },
] as const

function DocsIndex() {
  return (
    <Container width="wide" className="py-[clamp(3rem,7vw,5rem)]">
      <Eyebrow>Docs</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">Quick start</h1>
      <p className="mt-5 max-w-2xl text-body-lg text-ink-2">
        Peek is a zero-config CLI. It runs one project's dev server and shares the
        verified port through one temporary HTTPS link.
      </p>

      <div className="mt-8 max-w-xl">
        <CopyCommand command={site.install.pnpm} />
      </div>

      <ol className="mt-14 grid gap-10 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <p className="font-mono text-mono-xs text-accent-strong">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h2 className="mt-3 text-h3 font-medium">{step.title}</h2>
            <p className="mt-2 text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-16 flex flex-wrap gap-x-8 gap-y-4 border-t border-line pt-8">
        <TextLink href="/docs/cli">CLI reference</TextLink>
        <TextLink href="/docs/troubleshooting">Troubleshooting</TextLink>
        <TextLink href="/security">Security model</TextLink>
        <TextLink href="/changelog">Changelog</TextLink>
      </div>
    </Container>
  )
}
```

- [ ] **Step 4: Build, typecheck, lint**

Run:
```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
```
Expected: all exit 0. Confirm the prerendered `docs/cli` HTML contains rendered
markdown. The generated HTML also embeds the loader result as JSON, so a bare
`grep` passes even when the visible DOM is wrong. Strip `<script>` blocks first:

```bash
node -e 'const h=require("fs").readFileSync("website/dist/client/docs/cli/index.html","utf8").replace(/<script[\s\S]*?<\/script>/g,""); for (const n of ["aria-label=\"Documentation\"","Argument and output selection","class=\"shiki"]) if(!h.includes(n)) throw new Error("missing "+n); console.log("prerender ok")'
```

Also confirm the crawler emitted exactly one `/docs` page — a nested `docs.tsx`
layout adds a second, empty one:

```bash
find website/dist/client -name '*.html' | grep -c '/docs/index.html'
```

Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add website/src website/tests
git commit -m "feat(website): add quick start, CLI reference, and troubleshooting pages"
```

---

### Task 5: Changelog page

**Files:**
- Modify: `website/src/routes/changelog.tsx`

- [ ] **Step 1: Replace `website/src/routes/changelog.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Container } from '../components/Container'
import { Eyebrow } from '../components/Eyebrow'
import { Prose } from '../components/Prose'
import { version } from '../content/version'
import { renderChangelog } from '../lib/docs-render'

export const Route = createFileRoute('/changelog')({
  head: () => ({
    meta: [
      { title: 'Changelog — Peek' },
      {
        name: 'description',
        content: 'Every release of the Peek CLI, newest first.',
      },
    ],
  }),
  loader: () => renderChangelog(),
  component: ChangelogPage,
})

function ChangelogPage() {
  const { releases } = Route.useLoaderData()

  return (
    <Container className="py-[clamp(3rem,7vw,5rem)]">
      <Eyebrow>Changelog</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">
        Release history
      </h1>
      <p className="mt-5 max-w-2xl text-body-lg text-ink-2">
        Peek is currently on <span className="font-mono">v{version}</span>. Every
        release below is published to npm with provenance.
      </p>

      <div className="mt-16 flex flex-col gap-16">
        {releases.map((release) => (
          <section key={release.version} id={`v${release.version}`}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-4">
              <h2 className="font-mono text-h3 font-medium">
                v{release.version}
              </h2>
              {release.date ? (
                <time
                  dateTime={release.date}
                  className="font-mono text-mono-xs text-ink-3"
                >
                  {release.date}
                </time>
              ) : null}
            </div>
            <Prose className="mt-6" html={release.html} />
          </section>
        ))}
      </div>
    </Container>
  )
}
```

- [ ] **Step 2: Build, typecheck, lint, verify**

Run:
```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
find website/dist/client -name '*.html' -print0 | xargs -0 grep -l 'Release history'
```
Expected: gate passes. Check the rendered DOM (after stripping `<script>` blocks,
see deviation 4) for `Release history`, `<section id="v0.3.0"`, and one `<time>`
per release. Also confirm the raw source stayed out of the JS bundle:

```bash
! grep -rlF 'interactive migration notice' website/dist/client/assets
```

The phrase is unique to `CHANGELOG.md`, so any match in a `.js` asset means the
raw file leaked into the client bundle. (It legitimately appears inside
`dist/client/changelog/index.html`, which is the page's own content.)

- [ ] **Step 3: Commit**

```bash
git add website/src/routes/changelog.tsx
git commit -m "feat(website): add changelog page"
```

---

### Task 6: Features and security pages

**Files:**
- Modify: `website/src/routes/features.tsx`
- Modify: `website/src/routes/security.tsx`

- [ ] **Step 1: Replace `website/src/routes/features.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Container } from '../components/Container'
import { Eyebrow } from '../components/Eyebrow'
import { SectionHeading } from '../components/SectionHeading'
import { TextLink } from '../components/TextLink'

export const Route = createFileRoute('/features')({
  head: () => ({
    meta: [
      { title: 'Features — Peek' },
      {
        name: 'description',
        content:
          'Zero-config previews, verified ports, deterministic shutdown, and honest limits.',
      },
    ],
  }),
  component: FeaturesPage,
})

const features = [
  {
    title: 'Zero config',
    body: 'Peek reads the dev script already in your project. No config file, no account, no flags for the normal case.',
  },
  {
    title: 'Verified port ownership',
    body: 'Peek starts your dev server, finds the port it actually binds, and confirms that port belongs to the process it started before sharing anything.',
  },
  {
    title: 'Managed cloudflared',
    body: 'Peek downloads a pinned Cloudflare binary, verifies its SHA-256 digest, and caches it. You never install cloudflared yourself.',
  },
  {
    title: 'One lifecycle',
    body: 'The dev server and the tunnel stop together on exit, failure, or Ctrl-C, and Peek reports the concrete reason if cleanup cannot confirm every child exited.',
  },
  {
    title: 'Choose your exposure',
    body: 'Public by default, HTTP Basic auth with --password, or no tunnel at all with --private. The terminal always shows which mode is active.',
  },
  {
    title: 'Works with your stack',
    body: 'pnpm, npm, Yarn, or Bun. HTTP and WebSocket upgrades proxy through, so hot reload keeps working.',
  },
] as const

function FeaturesPage() {
  return (
    <Container width="wide" className="py-[clamp(3rem,7vw,5rem)]">
      <Eyebrow>Features</Eyebrow>
      <SectionHeading className="mt-4">
        Everything a preview needs. Nothing it does not.
      </SectionHeading>
      <p className="mt-5 max-w-2xl text-body-lg text-ink-2">
        Peek does one job: turn a local dev server into a temporary link you can
        send. These are the pieces that make that reliable.
      </p>

      <ul className="mt-16 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <li key={feature.title} className="bg-bg p-7">
            <h2 className="text-h3 font-medium">{feature.title}</h2>
            <p className="mt-3 text-ink-2">{feature.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-ink-2">
        Curious about the boundaries? Read the{' '}
        <TextLink href="/security">security model</TextLink>.
      </p>
    </Container>
  )
}
```

- [ ] **Step 2: Replace `website/src/routes/security.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DocLayout } from '../components/DocLayout'
import { Prose } from '../components/Prose'
import { renderSecurityDoc } from '../lib/docs-render'

export const Route = createFileRoute('/security')({
  head: () => ({
    meta: [
      { title: 'Security model — Peek' },
      {
        name: 'description',
        content:
          'How Peek handles binary trust, credentials, and network exposure while sharing a development port.',
      },
    ],
  }),
  loader: () => renderSecurityDoc(),
  component: SecurityPage,
})

function SecurityPage() {
  const { html, headings } = Route.useLoaderData()
  return (
    <DocLayout
      eyebrow="Security"
      title="Security model"
      intro="Peek shares a development port to the public internet. This page is the honest account of what that means."
      currentHref="/security"
      headings={headings}
    >
      <Prose html={html} />
    </DocLayout>
  )
}
```

Note the `h1` in Step 1: `SectionHeading` renders an `h2`, so using it as the
page title would leave the page with no `h1` (see deviation 7).

- [ ] **Step 3: Build, typecheck, lint, verify**

Run:
```bash
pnpm -C website build && pnpm -C website typecheck && pnpm -C website lint
```
Expected: gate passes. Check the rendered DOM (scripts stripped, see
deviation 4): the features page has exactly one `h1` and six `h2` tiles; the
security page has one `h1`, the four `##` sections from `SECURITY.md` with
anchors, and a sidebar link to `/security` carrying `aria-current="page"`.

- [ ] **Step 4: Commit**

```bash
git add website/src/routes/features.tsx website/src/routes/security.tsx
git commit -m "feat(website): add features and security pages"
```

---

### Task 7: 404, sitemap, robots, and link crawling

**Files:**
- Create: `website/src/lib/sitemap.ts`
- Test: `website/tests/unit/sitemap.test.ts`
- Modify: `website/src/routes/__root.tsx`
- Modify: `website/vite.config.ts`

- [ ] **Step 1: Write the failing test**

`website/tests/unit/sitemap.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildRobotsTxt, buildSitemapXml, sitemapPaths } from '../../src/lib/sitemap'

describe('sitemap', () => {
  it('lists every public page once', () => {
    expect(new Set(sitemapPaths).size).toBe(sitemapPaths.length)
    expect(sitemapPaths).toContain('/')
    expect(sitemapPaths).not.toContain('/404')
  })

  it('builds absolute URLs from the site URL', () => {
    const xml = buildSitemapXml('https://peek.example')
    for (const path of sitemapPaths) {
      const expected = path === '/' ? 'https://peek.example' : `https://peek.example${path}`
      expect(xml).toContain(`<loc>${expected}</loc>`)
    }
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml).toContain('<urlset')
  })

  it('points robots.txt at the sitemap', () => {
    expect(buildRobotsTxt('https://peek.example')).toContain(
      'Sitemap: https://peek.example/sitemap.xml',
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C website test`
Expected: FAIL — cannot find module `sitemap`.

- [ ] **Step 3: Write `website/src/lib/sitemap.ts`**

```ts
export const sitemapPaths = [
  '/',
  '/features',
  '/docs',
  '/docs/cli',
  '/docs/troubleshooting',
  '/changelog',
  '/security',
] as const

function toUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return path === '/' ? base : `${base}${path}`
}

export function buildSitemapXml(baseUrl: string): string {
  const urls = sitemapPaths
    .map((path) => `  <url><loc>${toUrl(baseUrl, path)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobotsTxt(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C website test`
Expected: PASS.

- [ ] **Step 5: Add the 404 route to `website/src/routes/__root.tsx`**

Import `NotFound` and add `notFoundComponent` to the root route options, so the
file's route definition becomes:

```tsx
import { NotFound } from '../components/NotFound'
// …existing imports…

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  head: () => ({
    // unchanged
  }),
  component: RootDocument,
})
```

- [ ] **Step 6: Generate `sitemap.xml` and `robots.txt` at build, and enable crawling**

In `website/vite.config.ts`:

1. Add the import at the top (`allowImportingTsExtensions: true` in
   `tsconfig.json` is required for the extension — see deviation 8):
```ts
import { buildRobotsTxt, buildSitemapXml } from './src/lib/sitemap.ts'
```

2. Add a site URL and a plugin above `export default defineConfig`:
```ts
const siteUrl = process.env.VITE_SITE_URL ?? 'http://localhost:3001'

/**
 * Emits sitemap.xml and robots.txt as build assets so the absolute URLs always
 * match the deployed origin instead of drifting in a hand-written static file.
 */
function seoAssets(): import('vite').Plugin {
  const files: Record<string, string> = {
    'sitemap.xml': buildSitemapXml(siteUrl),
    'robots.txt': buildRobotsTxt(siteUrl),
  }
  return {
    name: 'peek-seo-assets',
    apply: 'build',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}
```

3. Turn crawling on and register the plugin:
```ts
  plugins: [
    tailwindcss(),
    tanstackStart({ prerender: { enabled: true, crawlLinks: true } }),
    // React's Vite plugin must come after the Start plugin.
    viteReact(),
    seoAssets(),
  ],
```

- [ ] **Step 7: Build and verify prerender + assets**

Run:
```bash
pnpm -C website build
find website/dist/client -maxdepth 1 \( -name 'sitemap.xml' -o -name 'robots.txt' \) | sort
find website/dist/client -name '*.html' | wc -l
```
Expected: `sitemap.xml` and `robots.txt` are emitted; the HTML count is 7
(home, 6 secondary pages) — proving crawl-based prerender reached every route.
The `postbuild` check (deviation 10) then asserts the sitemap lists exactly
those 7 paths, so drift fails the build instead of relying on this command.

- [ ] **Step 8: Full gate**

Run:
```bash
pnpm -C website test && pnpm -C website typecheck && pnpm -C website lint && pnpm -C website build
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all exit 0.

- [ ] **Step 9: Commit**

```bash
git add website/src/lib/sitemap.ts website/tests/unit/sitemap.test.ts website/src/routes/__root.tsx website/vite.config.ts website/tsconfig.json website/package.json website/scripts/check-sitemap.mjs
git commit -m "feat(website): add 404, sitemap, robots, and full link crawling"
```

---

## Plan 2 exit criteria

- `pnpm -C website test`, `typecheck`, `lint`, `build` all pass.
- `website/dist/client` contains prerendered HTML for `/`, `/features`, `/docs`,
  `/docs/cli`, `/docs/troubleshooting`, `/changelog`, `/security`, plus
  `sitemap.xml` and `robots.txt`.
- Every prerendered page appears in `sitemap.xml` and vice versa — enforced by
  the `postbuild` check, not by eye.
- No Markdown parser is present in the client bundle (rendering happens in
  loaders at build time).
- Root `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still pass.

---

## Follow-on plan

This plan stops at a fully linked, fully prerendered site. Motion, browser
testing, CI, and deployment are covered by
[Plan 3 — motion, QA, CI, deploy, PR](2026-10-12-marketing-website-qa-release.md).
