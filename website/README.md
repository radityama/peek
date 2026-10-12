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
