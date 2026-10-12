# Peek Marketing Website — Art Direction & Design Spec

- **Date:** 2026-10-12
- **Status:** Approved concept (A). Pending written-spec review before implementation planning.
- **Branch:** `feat/marketing-website` (from `origin/main`, Peek v0.3.0)
- **Scope:** A separate, statically prerendered marketing + documentation site in
  an isolated `website/` directory. No changes to the CLI package, its build, or
  its release automation.
- **Reference (methodology only, no asset reuse):** `twentyhq/twenty` →
  `packages/twenty-website/src/{tokens,ui,sections,fonts}`.

## 1. Verified product constraints

These are load-bearing; copy and demos must not contradict them.

- One command: `peek` detects pnpm/npm/Yarn/Bun, runs the `dev` script, verifies
  the real port (never assumes `3000`), and opens a temporary
  `*.trycloudflare.com` HTTPS URL through a managed, checksum-pinned
  `cloudflared`.
- Modes: `peek` (public, default), `peek --password` (HTTP Basic at Peek's local
  loopback proxy), `peek --private` (no tunnel), `peek --lan` (LAN URL, no
  tunnel). `--expires` (≤ 24h), QR output, `--json`, `peek doctor`.
- Limits to state plainly: development-only; no uptime guarantee; Quick Tunnels
  do not support SSE and change hostname per session; no account, no telemetry,
  no source-code upload.
- Never claim: permanent URLs, Peek-operated relay, hosting/deployment, edge
  authentication, or that `--private` rebinds the app's network interface.
- Protected mode consumes the `Authorization` header; the dev port itself stays
  reachable locally/LAN. State both.

## 2. Creative thesis

**Peek is the smallest useful bridge between localhost and everywhere else.**

The identity expresses precision, connection, motion, and terminal-native
engineered calm — editorial and technical, no retro-terminal cosplay, no SaaS
gradient blobs. Working headline: **"Run it here. Open it anywhere."**
Supporting positioning stays "Run your dev server. Share it instantly."

## 3. Chosen concept: "The Route"

A single continuous connection path is the layout spine, not decoration.

- The hero is **not** headline-beside-screenshot. A large, tightly tracked
  display headline occupies the upper measure; directly beneath it, integrated
  into the same composition, sits one full-bleed **product stage**: a real Peek
  terminal on one end, the temporary URL as the bridge, a small device frame on
  the other. It reads as one authored illustration.
- A thin **route rail** in the left margin threads the page: monospace section
  numbers and state labels (`localhost:3000` → `verified` → `trycloudflare.com`
  → `connected`). It is static markup; state changes are driven by cheap
  `IntersectionObserver` observation, never scroll hijacking or layout thrash.
- Section rhythm alternates **full-bleed product scenes** with **narrow
  editorial passages** so no two consecutive sections share a composition.
- Static-first: every terminal state and diagram is fully present in the
  prerendered HTML. Motion is a replayable enhancement, never required to
  understand the page.

Rejected: **B ("Here / There" diptych)** — too close to a two-column SaaS hero,
hardest to make mobile-intentional. **C ("Authored session")** — risks the
retro-terminal trap and weak editorial hierarchy.

## 4. Homepage narrative

**Scene 01 — The opening.** Minimal sticky nav (wordmark, Features, Docs,
Changelog, Security, GitHub, install). Mono eyebrow with the live version.
Display headline. One-sentence support. Primary CTA = install command
(`pnpm add -g @usepeek/peek`, npm alternative) with copy; secondary = GitHub /
docs. Then the full-bleed product stage described in §3.

**A — One command.** Narrow measure. A mono step list (detect → start →
verify → preview) beside a compact real terminal. Communicate detection and
port verification. No invented output.

**B — Localhost is no longer a dead end.** Full-bleed authored SVG: machine
(`localhost:3000`) → loopback proxy → Quick Tunnel → temporary URL → phone /
remote browser. Explicitly labelled temporary, no hosting, no relay. The route
rail crosses here.

**C — Share with intention.** An editorial four-row technical manifest (not
tabs, not cards): public `peek`, protected `peek --password`, private
`peek --private`, LAN `peek --lan`, each with real command and plain-language
access. One lightweight interactive island composes a command
(`--password --expires 30m`) and echoes the resulting access sentence. Copy must
state that password auth is enforced by the local proxy, that protected previews
consume `Authorization`, that `--private` does not rebind the app, and that LAN
mode requires the app to be reachable on the LAN.

**D — Made for real development.** Asymmetric editorial blocks with product
evidence: verified port discovery, managed checksum-verified binary,
reconnection, coordinated cleanup, `peek doctor`, `--json`. One large technical
composition (lifecycle/route timeline) plus smaller supporting details. Show
real `doctor` and JSON snippets.

**E — Technical transparency.** Dark surface band with mono annotations:
local-first, no source upload, no account, no telemetry, development-only,
explicit sharing state. Include a restrained "Know the limits" list. Links to
`/security` and `docs/SECURITY.md`.

**F — Signoff.** Short, confident: install command, GitHub link, understated
technical branding. Not a hero repeat. Closing line: "Built for the moment when
`localhost` isn't where you are."

**Footer.** Product (Features, Changelog, Roadmap doc), Docs (Quick start, CLI,
Configuration, JSON, Troubleshooting), Security (Security, private report),
Project (GitHub, Issues, Discussions, MIT). Mono version from package metadata
plus a "No telemetry" note.

## 5. Design system

**Typography.** Primary **Host Grotesk** (headings, nav, body, buttons);
technical **Azeret Mono** (commands, terminal, metadata, eyebrows, section
numbers, version labels, shortcuts). Both OFL 1.1, self-hosted via Fontsource
variable packages (`@fontsource-variable/host-grotesk`,
`@fontsource-variable/azeret-mono`) — no remote font requests. An editorial
serif may be used once if it demonstrably strengthens a section; default is no
serif.

Fluid type tokens (clamp), defined once in `@theme`:

| Token | Value (clamp) | Notes |
| --- | --- | --- |
| `--text-display` | `clamp(2.75rem, 7vw, 6rem)` | lh 0.98, tracking −0.03em |
| `--text-h2` | `clamp(1.9rem, 3.6vw, 3rem)` | lh 1.05, tracking −0.02em |
| `--text-h3` | `clamp(1.25rem, 2vw, 1.6rem)` | lh 1.2 |
| `--text-body-lg` | `clamp(1.0625rem, 1.2vw, 1.1875rem)` | lh 1.6 |
| `--text-body` | `1rem` | lh 1.65 |
| `--text-small` | `0.875rem` | lh 1.55 |
| `--text-mono` | `0.8125rem` | tracking 0.02em; uppercase for eyebrows |

Measures: body ≤ 68ch, editorial ≤ 60ch, hero headline deliberately wrapped.
Fallback metrics tuned (`size-adjust`) to bound CLS.

**Color.** Restrained warm neutral foundation, one signal accent, green reserved
for verified/connected state. Semantic tokens (OKLCH), light default + a strong
dark band:

```
--bg          oklch(0.985 0.004 95)   /* warm off-white */
--surface     oklch(0.965 0.006 95)
--ink         oklch(0.22 0.008 95)    /* near-black */
--ink-2       oklch(0.48 0.010 95)    /* secondary */
--ink-3       oklch(0.62 0.008 95)    /* tertiary/annotations */
--line        oklch(0.89 0.008 95)    /* hairline */
--accent      oklch(0.55 0.200 33)    /* signal vermilion: routes/links/focus */
--accent-strong oklch(0.46 0.190 33)  /* accent text on light, AA */
--success     oklch(0.52 0.130 150)   /* verified / connected only */
--dark-bg     oklch(0.19 0.008 95)
--dark-ink    oklch(0.96 0.004 95)
```

Accent is used sparingly (interactive, route moments, focus); success green
never becomes a neon developer wash. Gradients only inside a product
illustration. Every token pair is contrast-checked (AA) before Phase 7 sign-off.

**Layout.** Container `--w-content: 72rem`, wide `--w-wide: 88rem`, plus a
full-bleed escape. Gutters `clamp(1rem, 4vw, 3rem)`. 12-column editorial grid
with named measures. Section padding `clamp(4rem, 10vw, 9rem)`. Vertical rhythm
from a 4px base scale. Breakpoints follow Tailwind v4 defaults (`sm 640`,
`md 768`, `lg 1024`, `xl 1280`, `2xl 1536`); test viewports add 1440 and a wide
desktop width.

**Vocabulary.** Corner registration marks, connection lines, terminal cursor,
`localhost` / port labels, route rail, tiny status dots, structural grid
annotations. Used as a system, never scattered ornament. Any ASCII field is a
deliberate deterministic composition (CSS/SVG), bounded node count, no
continuous expensive animation.

## 6. Brand mark

No existing Peek logo exists in the repository (README uses a third-party banner
only), so create an original mark: a compact rounded-square "port" with an
aperture and one line exiting to a terminal dot — a local service with exactly
one path out. Monochrome, legible at 16px, works on light and dark. Wordmark
`peek` in Host Grotesk medium, tight tracking. Deliverables: nav mark, favicon
(`.svg` + `.ico`), and an authored OG/social asset — real generated files, never
broken remote placeholders.

## 7. Routes and content sources

| Route | Source |
| --- | --- |
| `/` | Authored sections (§4). |
| `/features` | Authored, grouped Start / Connect / Protect / Diagnose / Automate, each with a real command + evidence. |
| `/docs` + doc pages | Build-time render of canonical repo Markdown (see §8). |
| `/changelog` | Build-time parse of `CHANGELOG.md`; latest version cross-checked with `package.json`. |
| `/security` | Authored from `docs/SECURITY.md`, linking the canonical doc. |
| 404 | Authored, same design system. |

No pricing, login, enterprise, community, or standalone marketing roadmap route.
The existing `docs/ROADMAP.md` is rendered under `/docs` (it already separates
Released from planned work) rather than re-authored. Version, releases, and docs
are never duplicated by hand.

## 8. Content adapter contract

Build-time only; no runtime GitHub API for core content.

- `src/content/version.ts` — reads the root `package.json` version.
- `src/content/changelog.ts` — parses `CHANGELOG.md` into
  `{ version, date, sections[] }`.
- `src/content/docs.ts` — a manifest mapping each docs route to one or more
  canonical Markdown sources, rendered at build time.
- `src/content/site.ts` — `SITE_URL` (configurable, no invented production
  domain), nav, footer, OG descriptors.

Docs manifest (Quick start composed from README install + `docs/CLI.md`;
Configuration and Sharing modes built from anchored `docs/CLI.md` sections so
they never diverge): CLI (`docs/CLI.md`), JSON (`docs/JSON.md`),
Troubleshooting (`docs/TROUBLESHOOTING.md`), Security (`docs/SECURITY.md`),
Architecture (`docs/ARCHITECTURE.md`), Development (`docs/DEVELOPMENT.md`),
Tunnel providers (`docs/TUNNEL-PROVIDERS.md`), Roadmap (`docs/ROADMAP.md`).

Markdown is rendered at build time via a trusted unified pipeline
(`remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-slug` →
`rehype-autolink-headings` → `rehype-stringify`) with `shiki` build-time
highlighting, so there is **no client-side Markdown parsing**. A single small
client island adds copy buttons to `pre > code` and heading-anchor affordances.
Dependency rationale is recorded in the PR.

## 9. Component architecture

`website/src/{components,sections,scenes,styles,content,lib,hooks,assets,routes}`
plus `website/tests`. Purposeful primitives only:
`SiteHeader`, `SiteFooter`, `Container`, `Section`, `SectionHeading`,
`EditorialHeading`, `Eyebrow`, `PrimaryButton`, `TextLink`, `CommandBlock`,
`CopyCommand`, `TerminalStage`, `ConnectionDiagram`, `ConnectionStatus`,
`FeatureScene`, `SectionDivider`, `CornerMark`, `PageIntro`, `DocsNavigation`,
`ReleaseEntry`, `RouteRail`. Each has one clear responsibility and an explicit
owner; no speculative generic library.

## 10. Motion system

Motion for React (`motion/react`), selective. Tokens in `@theme`:
`--dur-quick 120ms`, `--dur-base 180ms`, `--dur-scene 420ms`,
`--ease-out cubic-bezier(0.2,0,0,1)`, `--ease-in-out cubic-bezier(0.4,0,0.2,1)`,
and a connection spring (`stiffness 260`, `damping 30`). CSS handles simple
hover/color/opacity. Motion is reserved for: terminal progression, connection
establishing, status transitions, button feedback, disclosure/nav state, diagram
transitions, copy confirmation, and a few section reveals.

`useReducedMotion()` gates every transform sequence: reduced motion gets the
complete final state immediately, opacity-only transitions, no forced sequence.
Motion is never required to understand content; no scroll hijacking, no pinned
scenes, no per-paragraph reveals, no arbitrary typing library.

## 11. Terminal demonstration

A deterministic, cancellable state machine
(`idle → detected → starting → ready → connecting → connected`) with fixed
timings. The server-rendered HTML already shows the complete terminal; the
island replays the sequence on demand. Accessible replay control (keyboard,
`aria-live` for state, a visible "demonstration" label), pause where meaningful,
bounded timers, no continuous renders, and it never opens a real tunnel.

## 12. Responsive and accessibility

Design mobile intentionally (never shrink desktop): 360, 375, 390, 768, 1024,
1280, 1440, wide. Below `lg` the product stage stacks, the route rail becomes a
horizontal seam, docs nav becomes a drawer, and long commands scroll safely
without page overflow. Monospace never drops below legible size.

WCAG 2.2 AA: semantic landmarks, one `h1` per route, skip link, visible focus
using the accent, full keyboard operation, accessible names, correct
link/button semantics, `aria-live` copy + terminal feedback, `aria-hidden`
decorative art, contrast-verified tokens, no hover-only affordances, no
obstructive autoplay.

## 13. Performance and SEO

Static prerender marketing and docs routes
(`tanstackStart({ prerender: { enabled: true, crawlLinks: true } })`). JS is
limited to small islands (terminal replay, copy, command composer, docs copy,
mobile nav). No client Markdown parsing, no decorative JS libraries. Fonts are
subset self-hosted WOFF2 with `font-display: swap`. Targets to measure, not
claim: mobile Lighthouse ≥ 95 across Performance/Accessibility/Best
Practices/SEO; LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms. Initial JS budget set and
justified after the first production build; bundles inspected.

Per-route title/description, canonical from `SITE_URL`, Open Graph + Twitter
cards, authored preview art, sitemap, `robots.txt`, accurate 404.

## 14. Repository integration

- New isolated `website/` package with its own `package.json` and
  `pnpm-lock.yaml`. Root stays a single CLI package (no monorepo).
- Commands: `pnpm -C website dev|build|typecheck|lint|test|test:e2e`. Existing
  root commands keep working unchanged.
- npm `files` allowlist already excludes `website/`; the published CLI must never
  include it. A `pnpm pack:check` regression assertion covers this.
- `website/.gitignore` for `.output`, `.tanstack`, `.wrangler`, `dist`; the root
  `node_modules/` rule already covers nested modules.
- Housekeeping (pending confirmation): the untracked `docs/website/` on `main`
  is stale generated output with no source and is superseded by `website/`; it
  should be removed or ignored before scaffolding. The unrelated local
  `feat/website` branch (an imported Better Auth site, based on v0.2.2, remote
  already deleted) is left untouched.

## 15. Testing

- **Vitest:** changelog parser, version/content consistency, docs manifest,
  terminal state-machine transitions, command composer output, copy behavior.
- **Playwright:** every route, nav, copy command, terminal replay, mobile nav,
  keyboard interaction, reduced motion, responsive overflow, broken internal
  links, console/hydration errors.
- **Visual:** screenshots at mobile/tablet/desktop/wide, reviewed for
  typography, wraps, alignment, contrast, spacing, terminal legibility, footer,
  and mobile composition. Defects fixed before sign-off.
- **Design review:** an explicit anti-slop pass against the banned-pattern list;
  the first pass is not accepted by default.

## 16. CI and deployment

A path-filtered `website.yml` workflow runs install, lint, typecheck, test, and
build. CLI workflows (`ci.yml`, `release.yml`) stay untouched. Deployment target
is Cloudflare Workers via `@cloudflare/vite-plugin` + `wrangler`; deployment
steps, required vars (`SITE_URL`), and troubleshooting are documented. Nothing
is claimed as deployed until it is.

## 17. Copy rules

Short, precise, developer-facing. Banned: "revolutionize", "supercharge",
"unlock limitless", "seamless/powerful/intuitive", "ultimate developer
experience", empty slogans. Every section explains a capability, demonstrates a
workflow, addresses a real problem, builds trust, or drives action. English
only. Honesty constraints from §1 are enforced; real limitations are shown where
they affect decisions.

## 18. Non-goals

Deployment/hosting product, permanent or custom-hosted URLs, auth, databases,
CMS, search infrastructure, analytics SDKs, client state libraries, Three.js,
GSAP, heavy charting, or a full UI framework. No pricing/login/enterprise/fake
community pages. No CLI refactors in website commits.

## 19. Acceptance criteria

The task's full checklist governs (branch + PR, CLI intact, publishing
unchanged, original design system, non-generic hero, accurate demos, all routes,
polished mobile, optimized assets, accessible motion, accurate content,
SEO assets, passing lint/typecheck/tests/build, reviewed screenshots, no console
or hydration errors, documented deployment, pushed branch, opened PR). Report
explicitly anything that cannot be met; never claim an unexecuted test passed.

## 20. Risks and decisions to finalize in Phase 2

- Exact accent hue and all contrast pairs (verify with a contrast checker).
- Whether the command composer ships in v1 or as progressive enhancement.
- Final dependency list and the initial JS budget number, recorded after the
  first production build.
- Whether `shiki` is retained or swapped for a lighter build-time highlighter if
  the bundle/PR weight is unjustified.
