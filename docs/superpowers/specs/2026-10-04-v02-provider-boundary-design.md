# v0.2 Provider Boundary Hardening

Status: recommended target and preparation design and written spec approved
in conversation. Implementation may proceed.

Baseline: `8b19cef`, package `@usepeek/peek` 0.2.2. PRs #10, #11 and #12
are merged with required CI passing. Branch: `refactor/v02-provider-boundary`.

## Goal and scope

Make the tunnel input an explicit local HTTP target, independent of the
original dev server's identity. Move concrete provider preparation out of the
CLI module. Preserve the lifecycle and cleanup guarantees established in
PR #11, the JSON contract from PR #12, and today's command behavior.

Add no provider, registry, dependency, package export, public-target option,
proxy, authentication, expiry, request inspection or v0.3 runtime behavior.
The future proxy will supply another local listener through this boundary;
this phase neither starts that listener nor decides its traffic policy.

The URL-only alternative leaves Cloudflare construction in the CLI. A
session-owned cleanup alternative requires a new partial-startup ownership
design because shutdown can happen before a session exists. Prefer the
explicit target and preparation boundary while retaining provider cleanup.

## Current architecture

`src/cli-command.ts` verifies or downloads the pinned Cloudflare binary,
constructs `CloudflareProvider`, and registers it with `Lifecycle` before
starting the dev process. LAN mode bypasses preparation and tunnel startup.

`src/core/run.ts` already imports only `TunnelProvider`. It discovers and
verifies the selected port, connects the provider, watches the connection's
exit, and retries without replacing the dev process. It disconnects before
each connection attempt. The provider currently receives a port and constructs
the numeric loopback HTTP origin itself.

`Lifecycle` owns cancellation, signals and bounded cleanup. The provider owns
its pending or active tunnel process, including a retained force handle when
exit cannot be confirmed. A successful connection exposes its public URL and
exit promise; it is not the sole owner of cleanup.

## Types and preparation

Refine `src/tunnel/types.ts` around these internal contracts:

```ts
export interface TunnelExit {
  exitCode: number | null
}

export interface TunnelSession {
  readonly url: string
  readonly exited: Promise<TunnelExit>
}

export interface ProviderPreparation {
  signal: AbortSignal
  onDownload: () => void
  onDiagnostic: ((line: string) => void) | undefined
  originHostHeader: 'localhost' | undefined
}

export interface TunnelProvider {
  readonly name: string
  connect(options: {
    target: URL
    signal: AbortSignal
  }): Promise<TunnelSession>
  disconnect(): Promise<void>
  forceDisconnect?(): void
}
```

`TunnelSession` names the existing URL and liveness result. Its URL remains a
string to preserve consumers, output and preview checks. Rename the old
internal `TunnelConnection` uses; this is not an exported npm API.

Move the existing production preparation function into `src/tunnel/prepare.ts`.
It still calls `ensureCloudflared` with the same cancellation and download
callback, then constructs the same Cloudflare implementation with diagnostics
and the optional localhost Host override. Keep the existing injected
`CliDependencies.prepareProvider` test seam. The CLI consumes this factory and
the shared types instead of importing the binary manager and concrete class.

Provider selection remains the current sole `cloudflare` choice. Do not build
a registry, plugin mechanism or generic preparation framework. Cloudflare
binary/cache checks in doctor remain appropriate provider diagnostics.

## Target and security constraints

After the selected dev port passes the existing ownership and readiness
checks, `runPeek` passes `new URL('http://127.0.0.1:<port>')` to `connect`.
Each reconnect uses that same verified address and retains the dev process.
Keep human and JSON local URLs in their existing localhost representation.

Cloudflare validates the target before calling its launcher. Accept only
the current numeric IPv4 loopback HTTP model: protocol `http:`, canonical
hostname `127.0.0.1`, root pathname `/`, no username, password, query or
fragment, and a port from 1 through 65535. An empty URL port represents HTTP
port 80. Preserve the existing explicit `:80` form in the launcher argv.

Reject wildcard binds, DNS names, public/private network hosts other than
that loopback address, HTTPS, non-root paths and port zero. Report an
actionable `TUNNEL_CONFIG_ERROR` without echoing credentials or the full
rejected URL. This existing nonrecoverable error avoids retrying an invalid
internal target. Constructor-invalid URL strings are outside the typed input.

The launcher receives the validated target's address rather than an assumed
dev port. Another verified local HTTP listener can therefore be the origin.
No CLI/config option permits arbitrary targets. Future IPv6 or HTTPS origins
would require explicit readiness and transport decisions, not a relaxed guard.

Preserve Cloudflare's strict Quick Tunnel URL parser, pinned binary digests,
argv-only execution, diagnostic buffering, 45-second connection deadline and
`--http-host-header localhost` behavior. Do not move Cloudflare parsing or
configuration knowledge into core orchestration.

## Cleanup and reconnect ownership

Register the prepared provider before dev startup as today. Keep provider
cleanup callable before, during or after `connect`, including a rejected or
cancelled connection. `disconnect` must confirm exit or reject; it must retain
an unconfirmed child for force escalation.

Preserve three graceful seconds plus one forced second in the Cloudflare
implementation, and the lifecycle's five-second observation plus one-second
force deadline. Retain signal re-entry behavior, timer disposal, exit-rejection
observation and child identity guards. A session's `exited` reports transport
termination; it does not report dev-server failure.

Core disconnects before another connect and owns retry timing. This phase
does not change retry limits, counters or user-visible reconnect events.
The later process/reconnect phase will audit concurrent-connect preconditions
and finite failure policy. Authentication and request inspection belong above
the transport provider; they are absent from this contract.

## Tests and documentation

Add provider contract tests for valid loopback targets, including a port
representing another local listener and default HTTP port 80. Check the actual
launcher arguments and session URL/exit observation. Invalid targets must fail
before any launch, including credentials, external/wildcard/DNS hosts, schemes,
paths, query, fragment and port zero. Preserve cancellation and cleanup tests.

Add a generic core integration assertion that the selected, verified local
address reaches the provider through `target`, without requiring a Cloudflare
implementation. Keep the existing dev-process, cancellation and cleanup checks.

Migrate the real CLI fixture provider to consume the URL and shared preparation
type. Preserve its HTTP, actual WebSocket upgrade, Host-header, selected-port,
reconnect, LAN/no-provider and process cleanup tests. Assert the selected target
in the fixture journal; do not replace behavioral assertions with call counts.
Normal CI must remain independent of public Cloudflare.

Update `docs/ARCHITECTURE.md` as the authoritative ownership map. Describe
CLI preparation, `Lifecycle`/`runPeek`, `TunnelProvider`, `TunnelSession`,
pending-startup cleanup and the future proxy insertion point. Link rather
than duplicate JSON or security documentation. Do not modify the historical
v0.1 design to pretend it always used the new contract.

## Validation and delivery

After written-spec approval, create the implementation plan and execute it
with focused tests and reviews. Keep all changes on this branch and its PR.
Run lint, typecheck, test, build, pack check and packed smoke. Inspect all six
required CI jobs at the final reviewed head, fix failures on this branch, and
check main after a healthy merge.

Verify no new dependencies, exports, fixtures in the npm artifact, binary-pin
changes, JSON changes or runtime proxy appear in the diff. Package stays 0.2.2
in this phase. Release classification and packed preview dogfooding remain
later project gates.

## Upstream references

Context7 verified the official Cloudflare Quick Tunnel local `--url` model and
opt-in `httpHostHeader` origin setting, and the supported Node 22 WHATWG URL
properties and default-port elision. These inform target validation without
establishing any future authentication or end-to-end TLS guarantee.

- [Cloudflare tunnel concepts](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/tunnel/concepts/index.mdx)
- [Cloudflare origin settings](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/tunnel/configuration/index.mdx)
- [Node 22 URL API](https://nodejs.org/docs/latest-v22.x/api/url.html)
