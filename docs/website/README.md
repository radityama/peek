<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/branding/svg/better-auth-wordmark-light.svg" />

  <source media="(prefers-color-scheme: light)" srcset="public/branding/svg/better-auth-wordmark-dark.svg" />

  <img alt="Better Auth" src="public/branding/svg/better-auth-wordmark-dark.svg" width="280" />
</picture>

### Website & Docs

The main website and documentation for [better-auth.com](https://better-auth.com)

[![Website](https://img.shields.io/badge/better--auth.com-000?style=flat\&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNDUiIHZpZXdCb3g9IjAgMCA2MCA0NSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTAgMEgxNVYxNUgzMFYzMEgxNVY0NUgwVjMwVjE1VjBaTTQ1IDMwVjE1SDMwVjBINDVINjBWMTVWMzBWNDVINDVIMzBWMzBINDVaIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==\&logoColor=white)](https://better-auth.com)
[![GitHub Stars](https://img.shields.io/github/stars/better-auth/better-auth?style=flat\&logo=github\&label=stars\&color=24292e)](https://github.com/better-auth/better-auth)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](LICENSE)

***

## Quick Start

```bash
# from docs/website
pnpm install
pnpm dev
```

Open **[localhost:3000](http://localhost:3000)** to preview.

## Peek staging copy

This directory is a copy of `docs/` from
[`better-auth/better-auth`](https://github.com/better-auth/better-auth/tree/d1f785352ec2680af14ca38cdf68e6a38080ef56/docs)
at commit `d1f785352ec2680af14ca38cdf68e6a38080ef56`. Its Better Auth content
is intentionally unchanged for this first website setup. See
[UPSTREAM-LICENSE.md](UPSTREAM-LICENSE.md) for the upstream license.

The local `pnpm-workspace.yaml` supplies the dependency catalogs formerly
provided by the Better Auth monorepo. Documentation for v1.6 is copied from
commit `c11bfa667f9f260092c3d4c3798fe50d74b79718`. The upstream version
sync scripts are not run automatically because they expect the Better Auth
package outside this directory.

## Stack

* **Framework**: Next.js 16 (App Router, Turbopack)
* **Styling**: Tailwind CSS 4
* **Animation**: Framer Motion
* **Docs**: Fumadocs
* **Icons**: Lucide React
* **Fonts**: Geist Sans & Geist Mono

## Structure

```
├─ app/
│  ├─ page.tsx              # Home — hero + sign-in demo
│  ├─ products/             # Products page
│  ├─ blog/                 # Blog posts
│  └─ docs/[[...slug]]/     # Documentation (MDX)
│
├─ components/
│  ├─ landing/              # Marketing components
│  ├─ docs/                 # Documentation components
│  ├─ ui/                   # Shared primitives
│  └─ icons/                # Brand icons & logo
│
├─ content/                 # MDX documentation files
│
├─ lib/
│  ├─ source.ts             # Fumadocs content source
│  └─ utils.ts              # Utilities
│
└─ public/
   └─ branding/             # Logo assets (SVG + PNG)
```

## Scripts

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm start        # Serve production build
pnpm lint:fix     # Lint & auto-fix with Biome
```
