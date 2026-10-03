# v0.2 preview lifecycle hardening

Date: 2026-10-03
Status: design approved in conversation; written spec awaiting review
Branch: `refactor/v02-lifecycle`
Baseline: `c27092550ce0a41fe04e69b8f7dd9c56de5f2060`, Peek `0.2.2`
Prerequisite: [CLI integration harness PR #10](https://github.com/radityama/peek/pull/10), merged with all required checks passing

## Purpose

Make preview progress and shutdown explicit before the later provider and
proxy work. Keep the existing startup order, port verification, CLI callbacks,
and tunnel retry policy. This phase changes lifecycle ownership and fixes
cleanup races. It implements no proxy, authentication, expiry, or new provider.

The [architecture](../../ARCHITECTURE.md) and
[baseline audit](2026-10-03-v02-integration-harness-design.md) describe the
current flow. The integration harness now runs real CLI, dev, descendant, and
local transport processes on the CI platform matrix.

## Findings in the current code

`runPeek` orders startup and reconnects. `Lifecycle` owns resources, signals,
and cancellation, but progress is implicit in callbacks and requested/stopped
flags. There is no checked transition model.

In `Lifecycle.stop()`, calling `stopChildren()` starts provider cleanup before
the shared promise is assigned. A provider that synchronously calls `stop()`
from `disconnect()` can re-enter cleanup. The lifecycle also awaits provider
shutdown without an outer deadline. Cloudflare has its own deadline, but a
stalled provider can prevent dev cleanup and signal-handler removal.

`installSignals()` can register duplicate listeners. Direct `stop()` does not
abort pending work. Late resource registration only sends a single termination
request. Cleanup rejection can replace a startup error in `runPeek` and escape
the CLI's final cleanup, bypassing its normal renderer. Tests must reproduce
these paths before the fixes are accepted.

## Approach and ownership

Extend the existing `Lifecycle` rather than introducing a second state owner.
It owns the checked phase, shutdown cause, cancellation controller, registered
dev process and provider, signal handlers, and shared cleanup result.
`runPeek` still owns discovery, connection attempts, monitoring, and retries.
It advances lifecycle phases at the points where those operations occur.
The CLI selects dependencies and translates existing callbacks into output.

A separate state tracker would require synchronizing two owners during abort
and cleanup. A generic state-machine library would add machinery for a single
preview. A small transition table and domain methods are sufficient.

## Checked phases

Use these internal phases, derived from current operations:

| Phase | Meaning | Next progress phase |
| --- | --- | --- |
| `idle` | CLI validation and provider preparation; no dev process started | `starting-server` |
| `starting-server` | Starting the selected argv command | `discovering-server` |
| `discovering-server` | Reconciling port evidence and verifying readiness | `server-ready` |
| `server-ready` | The selected server port has passed existing verification | `tunnel-connecting`, or `ready` for LAN |
| `tunnel-connecting` | Initial tunnel attempts against the verified server | `ready` |
| `ready` | A public or LAN URL has been reported | `reconnecting` for a public tunnel drop |
| `reconnecting` | Replacing the tunnel while keeping the same dev process | `ready` |
| `stopping` | Cancellation and bounded resource cleanup | `stopped` |
| `stopped` | Cleanup attempt finished; its result is available | None |

Any active phase can enter `stopping`. Shutdown calls in `stopping` or
`stopped` reuse the same result. Initial connection retries stay in
`tunnel-connecting`; subsequent retries stay in `reconnecting`. Invalid
progress transitions fail internally. Cancellation checks prevent late async
results from advancing a stopping or stopped lifecycle.

Record why shutdown began separately from progress: normal completion,
requested shutdown, or failure. Requested shutdown retains the first signal
exit code when present. A failed preview reaches `stopped` after cleanup with
its original failure retained. `stopped` alone does not claim every child
exited if termination could not be confirmed.

The future proxy will be inserted after `server-ready` and before tunnel
connection. This phase adds no proxy states. Adding that resource later should
extend lifecycle transitions and cleanup ordering without rewriting CLI output
composition. The provider target API is a separate hardening phase.

## Shutdown contract

Publish the shared shutdown promise and enter `stopping` before invoking abort
listeners or resource cleanup. Every stop path cancels pending work. Repeated
calls return the same promise; synchronous re-entry cannot start another pass.
Signal installation is idempotent and final cleanup removes the owned pair.

Cleanup remains provider first, then dev process tree:

1. Allow provider `disconnect()` up to five seconds. This includes the current
   Cloudflare three-second graceful and one-second forced termination windows.
2. If it has not settled, invoke `forceDisconnect()` when available and allow
   one additional second for shutdown to settle. Observe late rejection so it
   cannot become an unhandled rejection.
3. Terminate the dev process tree with SIGTERM. Wait up to three seconds, then
   send SIGKILL and wait up to one additional second.
4. Remove signal handlers and finish the cleanup result even if a resource
   failed to close. Cleanup timers and temporary listeners are removed.

These are waiting budgets, with a nominal worst-case total of ten seconds.
They cannot guarantee that an operating system or broken provider obeys a
termination request. A missing force hook or unconfirmed process exit produces
an actionable cleanup failure rather than a silent success.

A further termination request forces both owned resources and advances cleanup
to its bounded forced wait. It preserves the first signal's exit code. Force
hook exceptions must not prevent dev termination or listener removal.

Resource registration cannot revive a stopping or stopped lifecycle. A resource
created during cancellation must be closed using bounded cleanup, with its
result observed. Existing startup cancellation checks remain in place to
avoid creating resources after shutdown. Provider connection must honor the
supplied abort signal; cancellation must not publish a late URL or start new
preview probes.

## Errors and compatibility

Retain the primary startup or dev-server failure if cleanup also fails. The
CLI reports cleanup failure through the existing error renderer, adding useful
cleanup detail without exposing a stack trace by default. No cleanup rejection
may escape the CLI's finalization into Citty's fallback logging. Introduce a
single internal cleanup error code if needed to make that diagnostic actionable;
the broader error taxonomy remains a later phase.

Normal completion and successful `doctor --live` completion remain exit 0.
CLI misuse remains 2 and ordinary failure remains 1. SIGINT and SIGTERM retain
130 and 143, including when cleanup reports a problem. A requested stop without
a signal, used by live doctor, must not become a synthetic Ctrl+C failure.
A cleanup failure during otherwise successful completion uses exit 1.

Existing human output and JSON event names, fields, and schema version remain
intact. Internal phase names are not new JSON state values. Reconnect continues
to emit the existing warning/state sequence and another `ready`. This phase
adds no shutdown event and changes neither retry delays nor retry count reset.
The later process/reconnect phase will decide a finite retry policy.

No package export, runtime dependency, flag, port-selection rule, configuration
precedence, cloudflared pin, or checksum policy changes. Genuine runtime cleanup
fixes will count toward the final v0.2.3 release decision.

## Test plan

Use unit tests with small process/provider adapters for transition checks and
fake timers for shutdown deadlines. Keep real subprocess tests for ownership
and cancellation. Test fixture controls stay outside the published package.

| Scenario | Required observation |
| --- | --- |
| Public startup and LAN startup | Checked phases follow their separate verified-server paths |
| Tunnel drop and recovery | `ready` to `reconnecting` to `ready`; original dev PID and port survive |
| Invalid transition or progress after stop | Rejected without a URL or new resource |
| Direct stop or synchronous cleanup re-entry | One shared promise, one cleanup pass, aborted pending work |
| Duplicate signal installation | One listener per signal, both removed after cleanup |
| Stop before dev spawn, during discovery, or during connect | All created resources terminate; no late readiness |
| Repeated termination requests, including during reconnect | Forced cleanup, first exit code retained, bounded completion |
| Provider disconnect rejects or never settles | Dev cleanup still runs; cleanup failure is reported |
| Provider force hook throws | Dev cleanup and listener removal still finish |
| Dev ignores graceful termination | Forced termination and bounded exit observation |
| Resource registered during or after shutdown | Immediate bounded cleanup; no state resurrection |
| Startup failure plus cleanup failure | Original failure remains useful; JSON stdout stays parseable |
| Dev exits after readiness | Preview fails and the transport is cleaned up; no reconnect |
| Successful live-doctor requested stop | Cleanup completes with exit 0 |

Use Vitest's asynchronous timer advancement for promise-based deadlines and
restore real timers after each unit test. Real CLI tests assert recorded PIDs
and listener closure before harness fallback disposal. POSIX tests send real
signals. Windows tests identify IPC signal-handler invocation separately from
real process-tree termination; native Windows console Ctrl+C remains an
explicit limitation.

Run targeted lifecycle and CLI tests, then lint, typecheck, the full suite,
build, pack inspection, and installed packed smoke test. Push the same branch,
inspect all six required GitHub Actions jobs, and fix failures before marking
the implementation PR ready. Update architecture/development documentation
with implemented behavior and actual coverage.

## Boundaries and remaining work

This phase does not exhaust the adversarial process matrix. Port disappearance,
server movement to another port, finite retry exhaustion, native Windows
console delivery, and real framework HMR remain assigned to later hardening
or compatibility work. The JSON contract, target-address provider boundary,
exit taxonomy, and v0.3 security model also retain their dedicated phases.

The phase is complete when checked progress and shutdown ownership are tested,
the reproduced cleanup failures are fixed, all required local and CI gates
pass, and the focused implementation PR is reviewed and merged.
