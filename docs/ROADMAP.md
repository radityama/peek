# Roadmap

Peek is evolving from a zero-config tunnel launcher into a lightweight preview environment for developers.

> Run your dev server. Preview it anywhere. Share it safely.

This roadmap describes direction, not a fixed release schedule. Features may move between releases.

## Invariants

These hold for every version:

- **Zero-config first.** `peek` works with one command and no account.
- **Local-first.** No source-code uploads.
- **Account-optional.** Core ephemeral tunneling never requires a Peek account.
- **Provider-friendly.** No unnecessary lock-in to Peek infrastructure.
- **Secure by design.** A preview is always visibly public, protected, or private.
- **Terminal-native.** No dashboard required for normal usage.
- **Honest.** Peek never claims protection a provider cannot enforce.

## v0.1 — Zero-config previews

Status: **Released**

- Project detection (pnpm, npm, Yarn, Bun) and automatic `dev` script execution
- Explicit command (`peek -- npm start`) and port (`peek --port 5173`)
- Server readiness verification before tunneling
- Cloudflare Quick Tunnel with managed, checksum-verified `cloudflared`
- Temporary HTTPS URLs and terminal QR codes
- Coordinated lifecycle and graceful cleanup
- Linux, macOS, Windows
- Zero telemetry

## v0.2 — Reliable everywhere

Status: **Released**

Theme: make `peek` boringly reliable.

**Framework-aware detection.** Next.js, Vite, Astro, Nuxt, TanStack Start, Remix / React Router, SvelteKit, generic Node servers. Parse common output patterns without coupling the core to any framework.

**Server discovery strategies, in order:**

1. explicit `--port`
2. URLs emitted by the dev process
3. child-process socket inspection
4. process-tree inspection
5. verified common-port discovery

Never tunnel an unverified service.

**Blocked-host handling.** Detect when a dev server rejects the tunnel hostname (for example Vite `allowedHosts`) and print the exact fix instead of a blank page.

**WebSocket / HMR check.** Verify upgrades work through the tunnel and warn when they do not.

**Auto-reconnect.** Recover from dropped tunnels without restarting the dev server.

**`--lan` mode.** QR pointing at the local network address, no tunnel, for testing on a phone on the same Wi-Fi.

**`--json` output.** Machine-readable output for scripts and AI agents.

**`peek doctor`.** First troubleshooting command: Node, package manager, `cloudflared` presence and checksum, network reachability, port detection, blocked-host and HMR checks.

**Windows.** Process-tree discovery, Ctrl+C handling, child cleanup, executable resolution.

**Optional `peek.config.ts`.** `defineConfig({ command, port, provider, qr })`. Plain `peek` must keep working whenever detection is possible.

## v0.3 — Local proxy and safe sharing

Status: **In progress**

Theme: public should not mean unprotected.

**Foundation: a local reverse proxy.** Peek runs a small proxy between the tunnel and the dev server. Password protection, expiry enforcement, request inspection (v0.4), and header redaction all build on it. It is provider-independent by design, since Quick Tunnels have no auth of their own.

- `--password` with interactive secret input (avoid shell history)
- `--expires 30m` / `--expires 2h` with automatic teardown
- `--public` / `--private` with a consistent high-level model
- Access modes: `private`, `protected`, `public`
- Security state always visible in terminal output:

```
PUBLIC PREVIEW      Anyone with this URL can access the service.
PROTECTED PREVIEW   Authentication is required.
```

## v0.4 — Preview inspector and multi-service

Theme: understand what hits your preview, and preview more than one thing.

**Inspector** (`peek inspect` / `--inspect`), built on the v0.3 proxy:

- method, path, status, duration, timestamp, sizes, selected headers
- sensitive headers redacted by default (`Authorization`, `Cookie`, `Set-Cookie`)
- `peek inspect 42` for request detail
- filters: `--method`, `--path`, `--status`
- webhook development as a first-class use case (observability first, not an API gateway)

**Multi-service previews.** Frontend + API, monorepos, docs + app:

```sh
peek --service web:3000 --service api:4000
```

or via config:

```ts
export default defineConfig({
  services: {
    web: { command: "pnpm web", port: 3000 },
    api: { command: "pnpm api", port: 4000 },
  },
});
```

Every exposed service must be explicitly selected or verified. Never expose arbitrary ports automatically.

## v0.5 — Named previews and Git awareness

Theme: URLs humans can recognize, previews that explain themselves.

**Named previews.** `peek --name checkout` via Cloudflare Named Tunnels on the user's own domain (opt-in, requires a Cloudflare account). No Peek infrastructure needed. `*.peek.dev` names arrive only with Relay (v0.8).

**Local project identity.** Optional `peek init` and `~/.peek/projects/`. Never mandatory, never uploads source.

**History and aliases.** `peek history`, `peek alias`. Local only unless the user opts into a future service.

**Git metadata.** Detect repository, branch, commit SHA, dirty tree. `--title "New checkout flow"`. `--pr` prints a block ready to paste into a pull request. Stays local unless explicitly shared. GitHub is never required.

## v0.6 — Programmatic API and CI

Theme: Peek as a building block.

- Export `start()` from `@usepeek/peek` for use in Playwright, e2e tests, and agents
- Typed events: ready, connected, disconnected, stopped
- `peek ci` for temporary previews from CI jobs
- Stable, documented exit codes and `--json` schema

## v0.7 — Preview access

Theme: share with people, not the entire internet.

Identity-aware previews:

```sh
peek --allow alice@example.com
peek --allow-domain example.com
peek access list | add | remove
```

Mechanisms: email one-time code, GitHub, Google. Provider-dependent: initially via Cloudflare Access, later via Relay. Authentication should happen before traffic reaches the developer's machine whenever the provider allows it. Peek does not build its own identity system.

## v0.8 — Peek Relay

Theme: control the complete preview experience.

Build only if adoption justifies operating infrastructure. An optional first-party transport (`peek --provider peek`) offering stable URLs, named previews, access policies, expiry, regional relays, and faster reconnection. Never required. Cloudflare and other providers stay first-class.

## Additional providers

Delivered incrementally across releases, always behind the tunnel-provider abstraction: `--provider cloudflare | tailscale | localtunnel | ngrok`, plus `peek providers` to list readiness and account requirements. Cloudflare remains the zero-config default. When a provider needs setup, Peek explains it instead of failing silently.

## v1.0 — Developer preview environments

Theme: one command from localhost to collaboration.

```
peek                                   # simple case
peek --name checkout --private --expires 2h   # full case
```

v1.0 ships when the invariants above hold across the whole feature set and the CLI, config, and API surfaces are stable.

## Beyond v1

- Preview comments for designers, clients, teammates
- GitHub integration attaching previews to pull requests
- Organization policies (disable public previews, max lifetime, require auth)
- Team namespaces (`checkout.acme.peek.dev`)
- Audit events (created, stopped, access granted or revoked) without collecting application traffic by default

## Non-goals

Peek should not become:

- a deployment platform
- a replacement for Vercel or Cloudflare
- a general-purpose VPN
- a production reverse proxy
- a Kubernetes platform
- a mandatory cloud service

> Turn a development server into a preview you can safely open or share, with almost no setup.
