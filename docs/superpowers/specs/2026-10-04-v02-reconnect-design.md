# v0.2 Bounded Tunnel Recovery

Status: approach and written spec approved in conversation on 2026-10-04.
Implementation follows the [phase plan](../plans/2026-10-04-v02-reconnect.md).

Baseline: main `a54a661`, package `@usepeek/peek` 0.2.2. PRs #10 through #14
are merged with required and post-merge CI passing. Branch:
`fix/v02-reconnect`.

## Goal and scope

Bound failed tunnel recovery without restarting the dev server. Protect
Cloudflare's ownership of its pending or active child and remove its stream
listeners when exit observation finishes. Preserve the lifecycle, verified
target boundary, JSON shapes and exit policy from the preceding phases.

This is the first of two Task 6 PRs. A dependent process PR will reproduce and
address adversarial dev process trees, held streams and listener changes after
this PR is healthy and merged. Task 6 remains incomplete until that work passes.

Add no CLI flag, config setting, dependency, provider, package export, proxy,
authentication or expiry. Keep the managed binary version and digests.

## Current behavior and alternatives

`runPeek` reconnects indefinitely. Its delay index grows after failed
connections and dropped sessions; neither resets after success. Failed-connect
warning numbers count only connection failures. Core disconnects the provider
before every connect, but `CloudflareProvider.connect` itself can overwrite
its child handle. Its anonymous stream listeners remain on retained streams
after exit.

A five-minute outage deadline would need to cancel a connection in progress
and add deadline coordination. A lifetime limit would accumulate unrelated
outages across long successful previews. Use the approved consecutive-event
limit, with a stable connection resetting the count and backoff.

## Retry policy

An instability event is either a recoverable failed connection attempt or a
resolved tunnel session exit. Count each event once. A reported `ready` event
does not itself reset the budget.

Allow eight consecutive instability events. After the eighth event, report an
actionable terminal `TUNNEL_CONNECTION_ERROR` and clean up through `Lifecycle`.
Start no ninth connection attempt and schedule no further retry delay. Ordinary
final cleanup still calls the provider's disconnect operation.

Keep the existing delay sequence after events one through seven:
1, 2, 4, 8, 16, 30, 30 seconds. The initial connection has no retry delay.

Measure a session from successful connection resolution to its resolved exit,
using a monotonic clock. If it lasted at least 30 seconds, reset the event count
and delay index before counting its drop as the first event of a new budget.
Evaluate this at exit; a separate reset timer is unnecessary. Short sessions
retain the current budget, including failed attempts before they connected.
Do not limit the duration of an active preview.

| Sequence | Result |
| --- | --- |
| Eight failed initial connections | Eight warnings, terminal failure, cleanup; no `ready`. |
| Seven failures, then a connection that stays active | Preview remains active. |
| Eight short sessions that each connect and drop | Eight `ready` events and eight drops, then terminal failure; no ninth connect. |
| Seven events, then a session lasting at least 30 seconds | Its drop starts a new budget at event one and the next delay is one second. |
| A failed attempt followed by a short session drop | Two events; the next delay is two seconds. |

Preserve failed-connect warning numbering as its current lifetime count. It
need not equal the consecutive instability count because drops also consume
the budget and stable sessions reset only the budget and backoff.

Retain the last recoverable connection failure in the current budget as an
optional cause for verbose exhaustion diagnostics; clear it on a stable reset.
The terminal message states that recovery stopped after
eight consecutive failures or drops. Its remedy tells the user to check the
network, use `peek doctor` or `--verbose`, and restart Peek after fixing the
problem. Do not expose a stack or introduce a new error code.

Cancellation and dev exit remain terminal immediately during connection,
monitoring and backoff. Abort the pending delay and start no replacement.
`SERVER_START_ERROR` and `TUNNEL_CONFIG_ERROR` remain nonrecoverable;
provider disconnect failure remains terminal rather than consuming retries.
A rejected session exit promise remains an observation failure, as today.

The retry loop still owns only tunnel recovery. It preserves the original dev
process and verified `http://127.0.0.1:<port>/` target. It neither rediscovers
a moved port nor restarts the command.

Eight events are a count, not a fixed elapsed deadline. Cloudflare retains its
45-second per-connect timeout. Eight timed-out attempts and seven retry delays
total nominally 451 seconds before provider cleanup and scheduling overhead.
Other failure patterns finish sooner or include time spent in ready sessions.

## Cloudflare ownership and streams

A provider owns at most one pending or active child. Reject another connect
before launching or changing diagnostics when the previous child's exit has
not been confirmed or its disconnect operation is still pending. Use an
actionable internal `TUNNEL_CONFIG_ERROR` for this contract misuse. Core's normal
disconnect-before-connect sequence stays valid.

Abort, startup timeout and rejected exit observation do not release ownership.
Keep the child available to disconnect and forceDisconnect until its exit is
confirmed. A confirmed exit permits a later connect once any pending disconnect
has settled. A synchronous launch failure creates no child and must not block
a later attempt.

Concurrent disconnect calls for the same child share one pending teardown;
do not run duplicate graceful deadlines or SIGTERM/SIGKILL sequences. A failed
teardown clears the pending operation so a later disconnect can try again,
while retaining the unconfirmed child. Preserve the existing three-second
graceful and one-second forced confirmation budgets.

Give stdout and stderr data listeners named references. Keep diagnostics
working after readiness, then remove these listeners when exit observation
resolves or rejects. Ignore further input from a retained old stream. Remove
startup abort listeners and the 45-second timer on startup settlement, as
today. A late event must not clear a different owned child or create readiness
after cancellation, timeout or exit. Observe rejections from teardown and exit
without leaving an unhandled promise or a timer behind.

The provider still tunnels a supplied target URL. It does not own the dev
process, retry timing or future access controls.

## Output and compatibility

Keep schemaVersion 1 and all existing payloads. Failed connection attempts,
including the final one, use `warning` / `reconnect-failed`. A resolved session
drop still uses `warning` / `tunnel-dropped`, then `state` / `reconnecting`.
Successful recovery emits `ready` with the same local URL and a replacement
public URL. Exhaustion uses the existing formatted `error` event, followed by
EOF and status 1 after cleanup. First signal statuses 130/143 keep precedence.
Human output uses the same diagnostic and remedy through its renderer.

The finite retry limit and backoff reset change behavior: a persistent outage
now stops Peek and its dev process, while an outage after a stable connection
starts at the shortest delay. Record both as user-facing fixes for the final
0.2.3 classification. No release occurs in this PR.

## Tests

Use the existing retry-delay seam and a narrow injected monotonic clock for
fast, deterministic duration boundaries. Keep defaults in production and do
not read test environment variables there. A small internal policy module is
acceptable; no generic retry or state-machine framework is needed.

- Cover exactly eight failed attempts and short-session drops, mixed failures
  and drops, the seven-event boundary, 29,999/30,000 ms reset boundaries,
  delay progression and lifetime warning numbering. Test no extra attempt.
- Run core integration cases with real Node dev and tunnel processes to prove
  startup exhaustion, recovery, same dev PID/target, and cleanup. Use tiny
  fixtures; normal tests must not contact Cloudflare.
- Exercise the real CLI command body in a subprocess for JSON exhaustion,
  short-session drop exhaustion and cancellation during backoff. An optional
  internal run dependency may apply existing timing seams in the test entry;
  its default must remain runPeek. Verify parseable stdout, existing contract
  shapes, empty JSON stderr, status 1 or the first signal status, and recorded
  PID/port shutdown before fallback teardown.
- Cover Cloudflare overlapping connects before and after readiness, confirmed
  exit allowing replacement, failed launch, aborted or timed-out startup,
  unconfirmed/rejected exit retaining the force handle, concurrent disconnect,
  retrying a failed disconnect and old-stream listener disposal. Use process
  adapters and fake time for deadlines; retain real fake-tunnel process tests.
- Retain existing dev death, nonrecoverable provider error, repeated signal,
  WebSocket and lifecycle regression coverage. Run new platform-independent
  cases on the existing Windows CI jobs. Do not claim native console coverage.

Update the authoritative retry and ownership sections in `docs/ARCHITECTURE.md`.
Link them from JSON and development documentation where necessary; document
exhaustion through existing error/status semantics rather than duplicating
an exit table. The changelog has versioned sections without an unreleased
section; leave release notes to the later release preparation PR.

## Delivery gate

Write and self-review the implementation plan after written-spec approval.
Implement only this PR's scope. Run targeted checks, then lint, typecheck,
test, build, pack:check and smoke:pack sequentially. Review the diff with
antislop. Commit meaningfully, push, update the PR and inspect all required
checks at the reviewed head. Fix failures on this branch. Merge only once
healthy, then inspect post-merge CI and update clean local main before starting
the dependent process PR.

The installed pack smoke currently checks version, help and config import.
Actual packed doctor, normal preview, JSON and LAN flows remain later project
validation. This PR does not claim framework dogfooding or Task 6 completion.
