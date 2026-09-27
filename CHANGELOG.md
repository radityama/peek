# Changelog

## 0.2.0 — 2026-09-27

- Recognize common Node development frameworks and require evidence before
  selecting an announced port outside the common-port set.
- Reconnect dropped Quick Tunnels while keeping the dev server running.
- Diagnose blocked tunnel hostnames and check Vite HMR WebSocket upgrades.
- Add LAN previews, newline-delimited JSON events, and `peek doctor` with
  optional live checks.
- Support optional `peek.config.ts` with an argv-array command and validated
  port, provider, and QR settings. `jiti` loads TypeScript configs on all
  supported Node 22 versions.
- Exercise descendant-process cleanup in integration tests.

## 0.1.1 — 2026-09-24

- Release Peek under a new npm version after `0.1.0` was already published.
- Normalize the executable path in package metadata and verify the installed
  `peek` command in the package smoke test.

## 0.1.0 — 2026-09-24

- Start a local `dev` script with pnpm, npm, Yarn, or Bun, or run an explicit
  executable with `peek -- <command>`.
- Detect and verify a reachable local server port before tunneling it.
- Download and verify a pinned Cloudflare `cloudflared` binary on first use.
- Create a temporary HTTPS Quick Tunnel and optionally display a terminal QR
  code.
- Stop the development server and tunnel together on exit or failure.
