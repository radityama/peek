# v0.2 CLI integration harness

Date: 2026-10-03
Status: design approved in conversation; written-spec review pending
Branch: `chore/v02-integration-harness`
Baseline: `a31d7898938572898aafa79f300ba775a81a7ff0`, Peek `0.2.2`

## Purpose and scope

Test Peek through its CLI before changing lifecycle, JSON, provider, and error
behavior. The first PR establishes reusable process tests and records the
architecture audit. Later hardening phases start from updated `main` after
their prerequisite PRs merge.

The harness exercises real Node processes and HTTP sockets with deterministic
local tunnel substitutes. Live Cloudflare checks remain opt-in. Runtime
dependencies, package version, pinned binary version, and asset digests stay
unchanged. Passwords, expiry, and the v0.3 local proxy belong to subsequent
roadmap work.

## Baseline architecture audit

The repository uses `tests/`, with no tracked `test/` directory. Its existing
[architecture](../../ARCHITECTURE.md), [decisions](../../DECISIONS.md), and
[v0.2 design](2026-09-27-peek-v0.2.0-design.md) describe the current product.

```text
CLI arguments and explicit command boundary
  -> optional config loading and CLI precedence
  -> project, package-manager, framework, and argv selection
  -> verified cloudflared preparation in public mode
  -> dev process startup
  -> output and process-socket discovery
  -> selected-port ownership evidence and loopback TCP verification
  -> tunnel connection, or verified LAN address selection
  -> preview monitoring and tunnel reconnection
  -> tunnel cleanup, then dev process-tree cleanup
```

| Owner | Responsibility | Existing test seam |
| --- | --- | --- |
| `src/cli.ts` | Citty flags, config precedence, provider construction, renderer selection, update notice, top-level exit status | CLI subprocess tests for help and validation; provider preparation cannot yet be injected |
| `src/core/config.ts` | Load trusted project TypeScript with jiti and validate supported values | Temporary config files and pure validation |
| `src/core/project.ts`, `framework.ts`, `dev-command.ts` | Read local project metadata and select executable plus argv | Metadata fixtures and pure selectors |
| `src/core/process.ts` | Execa dev process, piped output, exit observation, descendant termination | Real fixture executable |
| `src/core/server.ts`, `port.ts` | Pre-start port snapshot, output signals, platform socket inspection, TCP readiness | Injected inspection, timeout, common ports, and real listeners |
| `src/core/run.ts` | Startup order, LAN hold, dev exit monitoring, reconnect loop, preview probes | Provider, LAN selector, preview probe, retry delays, callbacks |
| `src/core/lifecycle.ts` | Cancellation, SIGINT/SIGTERM ownership, resource registration, idempotent cleanup | Real resources and direct stop requests |
| `src/tunnel/types.ts` | Provider connect/disconnect and connection exit contract | Fake provider implementations |
| `src/tunnel/cloudflare.ts` | cloudflared argv, diagnostics, URL validation, startup timeout, termination | Injectable tunnel launcher |
| `src/cloudflared/*` | Pinned asset mapping, trusted download, checksums, executable cache | Cache directory, asset, fetcher, and cancellation |
| `src/ui/*` | Human output, JSON output, and QR rendering | Output capture and terminal-size decisions |
| `src/core/doctor.ts`, `preview-checks.ts` | Environment checks and bounded host/HMR probes | Network check, fetcher, and upgrade probe |
| `src/update/*` | Independent npm update check, cooldown cache, notice after readiness | Registry request, cache path, clock, and notice callback |

### Lifecycle and ownership

`Lifecycle` owns the dev process, provider, cancellation controller, signal
handlers, and shared cleanup promise. It records requested/stopped flags and
an optional signal exit code. A second stop request forces termination.
Dev cleanup allows three seconds for SIGTERM, then one second for SIGKILL.
Cloudflare has its own three-second plus one-second disconnect deadline;
the lifecycle itself awaits the provider without a separate deadline.

`runPeek` owns startup, readiness, connection monitoring, and retries. Its
callbacks expose `starting`, `waiting`, `connecting`, and `reconnecting`;
readiness and stopping use separate callbacks or lifecycle flags. There is
no single checked transition model. Both `runPeek` and the CLI call the same
idempotent cleanup operation in `finally` blocks.

Dev failure terminates the preview. Tunnel failure retries the tunnel while
keeping the dev process alive. The current policy explicitly retries
indefinitely, with delays increasing from one to thirty seconds and then
remaining capped. A successful reconnect does not reset the retry counter.
The reconnect phase must decide a finite failure policy and document its
compatibility impact; this harness first records existing successful recovery.

### Coupling and interfaces

The core imports the provider contract rather than Cloudflare. The CLI imports
the Cloudflare binary manager and constructs the concrete provider. The
provider accepts a port and constructs `http://127.0.0.1:<port>` internally.
The later provider phase will assess accepting a verified target address so
the v0.3 proxy can sit between provider transport and the dev server.

CLI callbacks translate core observations into output. `JsonOutput` emits
`start`, `info`, `state`, `warning`, `success`, `diagnostic`, `child-output`,
`ready`, `lan-ready`, `error`, and `doctor-check`. Each has `schemaVersion: 1`
and an ISO timestamp. Help and version events are written directly by the CLI
without timestamps. Reconnect emits warnings/state followed by another
`ready`; there is no shutdown event. Error events contain a formatted message,
without a separate code or hint. Event types and extra fields are currently
unconstrained strings and records.

Expected failures use `PeekError` codes and actionable hints. CLI misuse exits
with 2; other caught failures and failed doctor checks use 1. Successful
completion uses 0. Handled SIGINT and SIGTERM use 130 and 143. The later error
phase will document and test the final mapping.

The update check is outside preview core and is skipped in JSON, doctor, CI,
and test modes. Local doctor has an HTTPS check; a deterministic CLI doctor
test will need an injectable doctor operation or network boundary. The
existing core doctor tests already inject its network check.

### Evidence and gaps

The clean baseline passed lint, typecheck, test, build, pack inspection, and
packed smoke testing on Linux with Node 24.16.0 and pnpm 11.20.0. All 149
tests across 20 files passed. The packed smoke test verifies executable
metadata, help, version, and the config export; it does not run a preview.

Existing integration tests run real dev and fake tunnel processes through
`runPeek`, cover descendant cleanup, early dev crashes, initial tunnel retry,
reconnection, and LAN orchestration. The existing tree fixture also terminates
its own child in its stop handler, so it does not isolate Peek's descendant
termination. CLI subprocess tests cover help, version, and invalid arguments,
but never reach successful preview readiness. Their helper combines stdout
and stderr, preventing a reliable stdout-only contract
assertion. LAN orchestration injects an address rather than exercising CLI
interface selection. The WebSocket probe test accepts an incomplete 101
response and exchanges no WebSocket messages.

CI requires six jobs: Linux x64 and ARM64, macOS x64 and ARM64, Windows x64
on Node 22, plus Linux x64 on Node 24. Existing cross-platform lifecycle tests
do not establish native Windows console Ctrl+C coverage. Framework package
and output parsing tests do not establish framework dogfooding results.

## Approach

Use a small internal CLI composition seam and a reusable subprocess harness.
The shipped executable retains the default dependencies. A test-only entry
invokes the same argument parsing, command execution, renderers, and lifecycle
with an injected provider-preparation function.

This is preferred over LAN-only subprocess tests, which leave public CLI
orchestration uncovered. Live Cloudflare tests are useful supplemental checks
but cannot provide a deterministic normal-CI baseline.

### CLI seam

Move CLI execution behind an internal callable entry that receives raw argv
and the narrowly scoped dependency needed to prepare a provider. The default
still verifies the pinned binary and constructs `CloudflareProvider`. Keep
production flags, command precedence, diagnostics, update behavior, and exit
semantics intact. The seam is internal, without a new package export, test
flag, environment override, executable-path setting, or checksum bypass.

An injected test entry is built into a temporary test artifact directory,
outside publishable `dist`. Tests of the normal executable continue to invoke
`dist/cli.js`. Test names and documentation identify which entry they use.

### Harness and fixtures

Keep support code under `tests/` and extend existing tiny Node fixtures where
that avoids duplication. Fixtures provide announced and silent listeners,
delayed startup, explicit ports, startup crashes, descendants, host rejection,
and a small WebSocket echo endpoint. Use ephemeral ports except when testing
explicit-port behavior. Fixtures record resource IDs independently of output
parsing when needed, so a JSON or logging regression cannot hide an orphan.
The descendant fixture leaves child termination to Peek rather than killing
that child in the fixture's own shutdown handler.

The harness starts the CLI without a shell, captures stdout and stderr
separately, parses complete JSON lines, waits for events or HTTP readiness,
and reports bounded failures with bounded captured diagnostics. Build shared CLI artifacts
once before test files run, avoiding concurrent rebuilds of `dist`.

Register every process, socket, and temporary directory for teardown as soon
as it is created. Readiness, exit, and cleanup waits have explicit deadlines.
Teardown runs after failed assertions and timeouts, attempts graceful shutdown,
then forces remaining fixture resources to stop. Process and listener checks
must run before teardown removes evidence: teardown cannot make a failed
Peek cleanup assertion pass.

### Deterministic tunnel and protocol tests

Use the existing injectable Cloudflare launcher to test URL parsing, early
exit, and tunnel-child cleanup. Where a reachable preview is needed, use a
test-only provider backed by a loopback forwarding process. It returns its
local URL and forwards HTTP and upgraded sockets to the selected dev port.
It stays under `tests/`; it does not become a v0.3 proxy implementation or a
CLI provider choice. Production Cloudflare URL validation remains strict.

Verify an HTTP response from the fixture through this transport. For
WebSocket coverage, validate the handshake and exchange an echo message,
then close the socket and verify cleanup. A 101 response alone is insufficient.
These tests demonstrate local transport behavior, not Cloudflare availability
or framework-specific HMR compatibility.

### Acceptance scenarios

| Scenario | Evidence required |
| --- | --- |
| Normal project dev script and explicit argv command | CLI reaches readiness and the fixture serves its expected HTTP response |
| Announced, silent, and delayed server | Selected port matches the fixture listener; delay does not cause early failure |
| Explicit port | CLI selects the requested, initially free fixture port |
| Invalid or occupied port | Actionable failure, expected current exit status, and no tunnel connection |
| JSON preview | Every stdout line parses as JSON; child stdout/stderr remain structured and separately identified |
| LAN | No provider preparation or connection; actual interface selection succeeds when one usable private address exists, or produces the documented missing/ambiguous-address diagnostic |
| SIGINT/SIGTERM on POSIX | CLI exits through its handler and fixture dev, descendants, and tunnel processes terminate |
| Windows | Real process-tree cleanup and explicit handler coverage; native console Ctrl+C remains a separately identified test requirement |
| Initial failure and dropped tunnel recovery | A replacement connection becomes ready while the original dev process remains alive |
| Blocked host | A real fixture rejection produces the expected warning without an unrelated HMR failure claim |
| WebSocket | Valid handshake and echo message through the local test transport, followed by socket cleanup |

LAN readiness checks that require a private interface explicitly skip with a
reason when the runner cannot supply one. Missing or ambiguous interface
behavior still receives deterministic core coverage. Sending `kill('SIGINT')`
on Windows must not be described as graceful console Ctrl+C: Node terminates
the process unconditionally. Handler coverage can use a test-entry control
channel, clearly labelled as such; native console behavior requires a Windows
console runner or recorded manual evidence in the later stress phase.

## Validation, risks, and follow-up

Run focused harness tests, then `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, `pnpm pack:check`, and `pnpm smoke:pack`. Inspect package contents
to confirm that test entries and transport fixtures are excluded. Update
`docs/DEVELOPMENT.md` with harness commands and the separation between local
tests and opt-in live checks once those commands exist.

Push the dedicated branch, create its PR, and inspect `gh pr checks`.
All required CI jobs must pass before the implementation phase is complete.
The initial spec can be published in a draft PR for written review; its green
checks establish only documentation validation, not harness completion.

The main risks are CLI behavior changing during extraction, timing-sensitive
process tests, cleanup assertions hidden by test teardown, and platform
assumptions. Keep the seam narrow, assert observable responses and process
exit, avoid fixed sleeps for readiness, and report platform limitations.

Record discovered issues as BLOCKER, BUG, HARDENING, V0.3, FUTURE, or OUT OF
SCOPE. Fix only harness blockers in this branch; behavior fixes receive the
appropriate focused follow-up PR unless they are required to keep this PR
healthy. Later phases own explicit lifecycle transitions, JSON schema and
compatibility, target-based provider contracts, error/exit mapping, reconnect
limits and adversarial cleanup, the v0.3 threat model, and real framework
dogfooding. The release decision follows those results.

## Documentation checked

The audit used Context7 to check the current Node 22 process and HTTP APIs,
Execa termination behavior, Vitest setup and hooks, and pnpm frozen installs.
The implementation plan must check any additional dependency API it uses.

- [Node 22 child processes](https://nodejs.org/docs/latest-v22.x/api/child_process.html)
- [Node 22 signals](https://nodejs.org/docs/latest-v22.x/api/process.html#signal-events)
- [Node 22 HTTP upgrades](https://nodejs.org/docs/latest-v22.x/api/http.html)
- [Execa descendant termination](https://github.com/sindresorhus/execa/blob/main/lib/terminate/kill-descendants.js)
- [Vitest global setup](https://vitest.dev/config/globalsetup)
- [Vitest hooks](https://vitest.dev/api/hooks)
- [pnpm install](https://pnpm.io/cli/install)
