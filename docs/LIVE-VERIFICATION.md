# Live Cloudflare verification

This records the v0.3 live gate run against real Cloudflare Quick Tunnels. It
is separate from the automated suite, which uses a local transport fixture and
never contacts Cloudflare. A local fixture is not a substitute for this run.

Run date 2026-10-10 on Linux x86_64 (four-vCPU host), Node v24.16.0, with the
pinned `cloudflared` 2026.9.1 already in `~/.peek/bin` (checksum-verified). The
dev origin was a small Node HTTP/WebSocket fixture that prints
`Local: http://localhost:<port>`. Except where noted, each scenario used
`peek --json -- <fixture>` from the built `dist/cli.js`.

| # | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Public Quick Tunnel starts | Pass | `ready` event with an `https://*.trycloudflare.com` URL |
| 2 | HTTPS reaches the local proxy | Pass | public `GET /` returned the origin body; `GET /health` returned 200 |
| 3 | Protected mode rejects unauthenticated access | Pass | no credentials -> HTTP 401 |
| 4 | Protected mode accepts valid credentials | Pass | `peek:<password>` -> HTTP 200, and the origin saw no `Authorization` header |
| 5 | A real browser can authenticate | Not run | see below |
| 6 | Representative WebSocket traffic works | Pass | upgrade returned `101 Switching Protocols`; origin and client frames both traversed the tunnel |
| 7 | HMR-style traffic works | Pass | a delayed server-to-client push arrived and a client frame reached the origin over the live tunnel |
| 8 | Host-header compatibility | Pass | `--host-header localhost`: the origin received `Host: localhost` |
| 9 | Reconnect produces a working replacement URL | Pass | killing the `cloudflared` child produced a `reconnecting` state and a second `ready`; the new URL returned 200 and the old one returned 530 |
| 10 | Expiry terminates the tunnel and proxy | Pass | `--expires 10s` exited about ten seconds after readiness; the URL then returned 530 |
| 11 | Ctrl+C stops the relevant processes | Pass | SIGINT exited 130 with no `cli.js`, dev-server, or `cloudflared` descendants left |
| 12 | No local process remains unintentionally exposed | Pass | after exit the selected port refused connections; no leftover tunnel process |

Protected-mode detail: an unauthenticated request and a wrong password both
returned 401; the correct password returned 200; the origin observed
`auth=no`, confirming Peek strips the Basic credential before forwarding.
After twelve failed attempts the proxy returned 429. A WebSocket upgrade with
no credentials returned 401, with a mismatched `Origin` returned 403, and with
no `Origin` or the matching preview `Origin` returned 101.

## Not run: real-browser authentication

The browser check was not executed in this environment. Two independent
obstacles apply, neither of them a Peek defect:

- The available Playwright Chrome distribution is not installed
  (`/opt/google/chrome/chrome` is absent), so no browser could be launched.
- The host resolver (Tailscale MagicDNS) does not resolve the wildcard
  `*.trycloudflare.com` names. HTTP clients could work around this by
  resolving through Cloudflare's DNS-over-HTTPS endpoint and pinning the edge
  address, but a browser-driven check was not run.

To finish this scenario, run it from a host whose resolver returns the Quick
Tunnel wildcard, install the browser the MCP is configured to use, and confirm
both the 401 prompt and a successful authenticated load, including whether the
browser sends Basic credentials on the HMR WebSocket handshake.

## Environment notes

- The Quick Tunnel hostname changes each run. Peek reports the URL as soon as
  `cloudflared` prints it; Cloudflare edge routing for the new name can lag by
  a few seconds. Immediately after a start or reconnect, a request may return a
  Cloudflare "Origin DNS error" page until the route propagates. Retrying
  succeeds. This is Cloudflare propagation, not a Peek readiness claim.
- Quick Tunnels are intended for testing and development. Cloudflare documents
  no uptime guarantee and, at the time of this run, no Server-Sent Events
  support. Peek documents these provider limits rather than working around
  them.
- The pinned `cloudflared` binary was not upgraded for this run.
