# Changelog

## 0.3.0 — Unreleased

- Route public tunnel traffic through a loopback proxy that rechecks ownership
  of the selected dev port before forwarding HTTP and WebSocket requests.
- Add `--password` with hidden terminal input and HTTP Basic authentication at
  the proxy. Peek removes the credential before requests reach the app.
- Add `--private` for previews without a public tunnel, explicit `--public`,
  and `--expires` for automatic teardown after first readiness.
- Show access mode and expiry in terminal output and JSON events.

## 0.2.2 — 2026-09-29

- Publish Peek under the canonical npm package `@usepeek/peek` while keeping
  `peek` as the executable. The final `@radityprtama/peek@0.2.2` release shows
  an interactive migration notice.
- Expand `peek doctor` with Peek and cloudflared versions, platform and
  architecture, and project/package-manager detection.
- Repair execute permission on a verified cached cloudflared binary without
  downloading it again.

## 0.2.1 — 2026-09-28

- Notify interactive preview users when a newer Peek version is published.
  Checks run independently of preview startup and never install updates.
- Cache successful and failed checks for 24 hours. Skip checks in JSON mode,
  CI, tests, and when `NO_UPDATE_NOTIFIER=1`.

## 0.2.0 — 2026-09-27

- Recognize common Node development frameworks and require evidence before
  selecting an announced port outside the common-port set.
- Reconnect dropped Quick Tunnels while keeping the dev server running.
- Diagnose blocked tunnel hostnames, offer `--host-header localhost` as a
  working remedy, and check Vite HMR WebSocket upgrades.
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
