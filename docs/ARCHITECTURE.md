# Architecture

Peek is one Node.js CLI package. In public and protected modes it owns two
process trees, the project's dev command and `cloudflared`, plus a loopback
proxy. Private and LAN modes own only the dev process.
A single lifecycle object coordinates cancellation and cleanup. Optional
`peek.config.ts` is local project code; there is no Peek configuration service.

```mermaid
flowchart TD
    CLI[CLI / flags] --> Project[Project and command selection]
    Project --> Dev[Dev process]
    Dev --> Detect[Port signals and readiness]
    Detect -->|private or LAN| LanURL[Local URL]
    Project -->|public or protected| Binary[Verified cloudflared cache]
    Binary --> Provider[Tunnel provider]
    Detect -->|public or protected| Proxy[Loopback proxy]
    Proxy --> Provider
    Provider --> URL[Local and public URLs]
    Life[Lifecycle] -. stop .-> Dev
    Life -. stop .-> Provider
    Life -. stop .-> Proxy
```

## Modules

| Module | Responsibility |
| --- | --- |
| `src/cli.ts` | Thin executable entry invoking the CLI command. |
| `src/cli-command.ts` | Citty flags, alias, top-level errors, and UI composition. |
| `src/core/project.ts` | Read local `package.json` and lockfiles only. |
| `src/core/framework.ts` | Identify a framework hint from local package metadata. |
| `src/core/config.ts` | Load and validate optional TypeScript project config. |
| `src/core/doctor.ts` | Run local environment checks without starting a preview. |
| `src/core/lan.ts` | Select and verify a local-network address. |
| `src/core/access.ts` | Resolve access flags and parse expiry durations. |
| `src/core/secret.ts` | Read a password from an interactive terminal without echo. |
| `src/core/proxy.ts` | Authenticate and forward HTTP/WebSocket traffic to one fixed dev port. |
| `src/core/preview-checks.ts` | Probe public host rejection and eligible HMR upgrades. |
| `src/core/dev-command.ts` | Build safe executable/argument arrays. |
| `src/core/process.ts` | Spawn and observe the dev process with Execa. |
| `src/core/port.ts` | Parse local output signals and probe loopback TCP. |
| `src/core/server.ts` | Reconcile output, child listeners, and newly opened common ports. |
| `src/core/run.ts` | Order startup, hold a LAN preview, and reconnect a dropped tunnel. |
| `src/core/lifecycle.ts` | Checked phases, shutdown outcome, resource ownership, and signals. |
| `src/core/cleanup.ts` | Bounded provider and dev cleanup with forced termination and error results. |
| `src/cloudflared/*` | Fixed release mapping, download, checksum, and cache. |
| `src/tunnel/types.ts` | Local target, session/liveness and provider cleanup contract. |
| `src/tunnel/prepare.ts` | Prepare the verified managed Cloudflare provider; CLI composition consumes this factory. |
| `src/tunnel/cloudflare.ts` | Validate the loopback HTTP origin, start the transport, parse its public URL and confirm process shutdown. |
| `src/ui/*` | Human and JSON event output and terminal-size-aware QR rendering. |
| `src/ui/json-event.ts` | Type the current JSON payloads and own metadata/framing for runtime, help and version events. |
| `src/update/*` | Best-effort npm version check, user-level 24-hour cache, and notification timing; no dependency from the preview core. |
| `src/utils/errors.ts` | Actionable error categories and formatting. |

## Execution lifecycle

1. Parse flags, inspect the current project, and select an argv array. An
   explicit command after `--` bypasses project inspection.
2. In public or protected mode, the tunnel preparation factory verifies or downloads the
   pinned `cloudflared` binary before starting the dev server. Register the
   prepared provider for cleanup. Private and LAN modes skip the tunnel engine.
3. Snapshot common ports and an explicit `--port`, then spawn the dev command
   without a shell. Stream both output channels to the terminal and port
   detector.
4. Select one candidate port. `--port` wins. Otherwise, emitted local URLs,
   process-owned listeners, and newly opened common ports provide evidence.
   TCP readiness is checked at `127.0.0.1`. Conflicts fail closed.
5. Public and protected modes start a loopback proxy fixed to the selected
   dev port, then a Quick Tunnel to the proxy. The proxy re-verifies the dev
   listener on each HTTP and WebSocket request. Protected mode checks the Peek
   password and removes its header before forwarding. A dropped tunnel is
   retried against the same proxy while the dev process stays alive. Public
   mode runs host-rejection and eligible HMR checks after a valid URL appears;
   protected mode skips probes that lack credentials. LAN mode verifies a
   private interface address. `--private` reports the loopback dev URL.
6. Expiry begins at the first ready URL and requests normal stop at its
   deadline. On dev exit or SIGINT/SIGTERM, stop the tunnel, then the proxy,
   then the dev process tree.

An eligible interactive preview starts the update checker after command
validation without awaiting it. A successful result is held until the first
preview URL is visible, then shown at most once. JSON, doctor, CI, and test
modes skip the check. The checker only requests the published npm version and
cannot change preview lifecycle or exit status.

```mermaid
sequenceDiagram
    participant User
    participant Peek
    participant Dev
    participant Proxy
    participant CF as cloudflared
    User->>Peek: peek
    Peek->>Dev: spawn manager run dev
    Dev-->>Peek: local port evidence
    Peek->>Dev: TCP probe 127.0.0.1:port
    Peek->>Proxy: listen on 127.0.0.1:ephemeral
    Peek->>CF: tunnel --url http://127.0.0.1:proxy-port
    CF-->>Peek: https://name.trycloudflare.com
    CF->>Proxy: HTTP or WebSocket request
    Proxy->>Dev: verify selected port, then forward
    Peek-->>User: local and public URLs
    User->>Peek: Ctrl+C
    Peek->>CF: stop
    Peek->>Proxy: close
    Peek->>Dev: stop process tree
```

### Progress and ownership

`Lifecycle` owns the checked phase, cancellation signal, shutdown outcome,
registered dev process, provider and proxy, signal handlers, and cleanup result.
`runPeek` owns discovery, connection attempts, monitoring, and retry timing;
it advances phases as those operations occur. CLI callbacks still use the
existing output states and JSON fields rather than the internal phase names.

| Phase | Meaning | Next progress phase |
| --- | --- | --- |
| `idle` | Command validation and provider preparation | `starting-server` |
| `starting-server` | Start the selected argv command | `discovering-server` |
| `discovering-server` | Reconcile port evidence and verify TCP readiness | `server-ready` |
| `server-ready` | The selected port passed verification | `tunnel-connecting`, or `ready` for private/LAN |
| `tunnel-connecting` | Attempt the initial tunnel connection | `ready` |
| `ready` | A public, private or LAN URL was reported | `reconnecting` on a public tunnel drop |
| `reconnecting` | Replace the tunnel against the same dev port | `ready` |
| `stopping` | Cancel pending work and clean up owned resources | `stopped` |
| `stopped` | The cleanup attempt finished and its result is available | None |

Any active phase can enter `stopping`. Invalid progress transitions throw;
cancellation checks after awaited work and callbacks prevent a late result
from publishing readiness or starting preview probes after shutdown.

Initial connection retries stay in `tunnel-connecting`; retries after a tunnel
drop stay in `reconnecting`. A failed connection or resolved session exit counts
once toward eight consecutive instability events. After event eight, Peek
reports `TUNNEL_CONNECTION_ERROR` and stops the tunnel and dev server without
another attempt. Delays after events one through seven are 1, 2, 4, 8, 16,
30 and 30 seconds; the initial connection is immediate.

A session lasting at least 30 seconds resets the event count, backoff and
current-budget cause before its drop counts as the next budget's first event.
Peek measures elapsed session time with a monotonic clock from connection
resolution to observed exit, before drop and state callbacks run. It evaluates
the reset at exit, without a separate timer. Short sessions do not reset the budget.
Failed-connect warning numbers retain their separate lifetime count.
The limit is a count rather than a fixed elapsed deadline: Cloudflare still
allows 45 seconds per attempt. Cancellation or dev exit ends recovery
immediately, including during a pending delay. Reconnect keeps the same dev
process and selected target; it does not rediscover another port.

Before the initial connect, before a reconnecting connect, before readiness is
reported, and before LAN readiness, `runPeek` re-verifies the fixed selected
port. `verifySelectedServer` requires the port to accept a loopback TCP
connection and, when process inspection is available, to remain in the tracked
tree's listener set; an unavailable inspection is not treated as ownership
loss, so only a confirmed empty or mismatched set fails. Failure is terminal
`SERVER_DETECTION_ERROR`, and Peek does not switch ports during a preview.
Public and protected requests receive a further check at the proxy; a failed
check returns 502 without forwarding. A listener replacement after the check
remains a local timing limit.

Shutdown outcome is separate from progress: `completed`, `requested`, or
`failed` with its primary error. The first SIGINT or SIGTERM status is retained
as 130 or 143 even if another signal follows. `stopped` records completion of
the cleanup attempt; its result must be checked to know whether termination
was confirmed.

Resource registration is awaited. A different resource cannot replace one
already owned; a resource registered during or after shutdown receives bounded
cleanup and the registration rejects. Cancellation checks also prevent
starting resources after a stop. Signal installation is idempotent, and
cleanup removes the owned SIGINT/SIGTERM handlers.

### Shutdown and diagnostics

Shutdown caches one resolving `Promise<CleanupResult>` before abort listeners
or cleanup hooks run. Direct stops, repeated calls, and synchronous re-entry
reuse that promise. Every stop aborts pending work. Cleanup errors are returned
as an optional actionable `PROCESS_CLEANUP_ERROR`, rather than an unobserved
promise rejection.

Cleanup runs provider first, closes the proxy and its open sockets, then stops
the dev process tree:

| Resource | Graceful waiting budget | Escalation | Forced waiting budget |
| --- | --- | --- | --- |
| Provider | 5 seconds for `disconnect()` | Invoke optional `forceDisconnect()` | 1 second for the same shutdown promise |
| Dev process tree | 3 seconds to confirm resource shutdown after SIGTERM | Send SIGKILL | 1 second to confirm resource shutdown |

The provider budget contains Cloudflare's existing 3-second graceful and
1-second forced waits. A further termination request forces both resources
and wakes the graceful wait immediately. Cleanup continues to the dev tree
if provider shutdown rejects or stalls; timers and temporary listeners are
removed after their waits. The nominal total waiting budget is 10 seconds.
These budgets bound observation; they cannot make a broken provider or the
operating system confirm termination. Missing force support and unconfirmed
shutdown produce cleanup diagnostics.

Root exit and resource shutdown are distinct. `DevProcess.exit` settles when
the direct dev root exits or its spawn fails; inherited pipes or descendants
can outlive it, so it is not proof that servers have stopped. Cleanup confirms
shutdown through `waitForStop(signal)`, which fulfils only after the tracked
process tree, including identified descendants, has stopped, and rejects when
observation itself fails. The signal cancels inspection, not the dev command;
Lifecycle still requests termination through `kill`. `dispose()` is idempotent
and releases the adapter's observation and stream handles after the attempt;
it is not evidence of OS termination and does not make `waitForStop` resolve.

The CLI uses its existing renderer for both the primary startup/dev error and
a distinct cleanup error, in that order. Cleanup alone is rendered once.
Default output contains the message and remedy; causes appear only with
`--verbose`. JSON errors remain event objects with parseable stdout, without
fallback stacks or human logs. See the [JSON event contract](JSON.md) for the
wire shape and stream behavior. The [CLI exit policy](CLI.md#exit-statuses-and-diagnostics) owns status meanings,
precedence for the first signal and primary failure, and doctor warning behavior.
Configuration failures use the internal CONFIG_ERROR; package.json failures
remain project errors. The CLI shares one Citty parse for help/version and
execution, and static output returns normally so stdout can drain.

### Provider and session boundary

```text
CLI composition
    -> tunnel preparation factory
    -> Lifecycle / runPeek
    -> TunnelProvider.connect({ target: URL, signal })
    -> TunnelSession { url: string, exited: Promise<TunnelExit> }
```

The CLI selects options and output. `src/tunnel/prepare.ts` owns concrete
Cloudflare construction and the verified binary dependency. Core orchestration
passes the proxy's loopback `http://127.0.0.1:<proxy-port>/` target; local display
URLs retain the selected dev port. Cloudflare accepts root HTTP targets
on that numeric loopback address with a valid port and without credentials,
query or fragment. It rejects other origins before launching a process.

A `TunnelSession` reports the transport's public URL and termination. The
provider retains `disconnect()` and optional `forceDisconnect()` because
cleanup must also work when startup has not returned a session. `Lifecycle`
registers the provider before dev startup; `runPeek` disconnects before every
connect attempt. Reconnection preserves the dev process and verified target.
The session does not own the dev server or decide retry timing.

Cloudflare rejects connect while it owns an unconfirmed child or a pending
disconnect. Concurrent disconnect calls share one teardown; failed teardown
retains the child and permits a later disconnect attempt. Confirmed exit and
settled teardown permit replacement. Stream data listeners remain active for
diagnostics after readiness and are removed on resolved or rejected exit
observation. Rejected observation, startup abort and timeout retain the force handle.
Startup abort and timeout settle the rejection before invoking the kill hook,
so synchronous output from that hook cannot create a session.

Cloudflare output parsing, process flags and config diagnostics stay inside the
tunnel implementation. Host-header compatibility remains the explicit
localhost override. Authentication, expiry and inspection are absent from
the transport contract. Doctor may inspect the managed engine as a diagnostic.

The proxy enters after `server-ready` and before tunnel connection. Its
loopback listener is the provider target while the dev URL remains the app
target. The provider has no knowledge of proxy authentication or expiry.
