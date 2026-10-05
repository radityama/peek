# v0.2 Adversarial Process Cleanup

Status: approach and written spec approved in conversation on 2026-10-05.
Implementation follows the [process cleanup plan](../plans/2026-10-05-v02-process-cleanup.md).

Baseline: main `2e1569b`, package `@usepeek/peek` 0.2.2. PRs #10 through #15
are merged with required and postmerge CI passing. Branch:
`fix/v02-process-cleanup`.

## Goal and scope

Finish Task 6 with real adversarial process tests and the smallest fixes for
reproduced v0.2 failures. Distinguish dev-root failure from confirmation that
Peek's owned resources stopped. Preserve provider-first shutdown, the existing
dev cleanup waiting budgets, signal statuses, error precedence and JSON shapes.

The preceding PR bounded tunnel recovery and hardened provider ownership.
This PR covers dev process trees, retained pipes, partial startup, owned
listeners and selected-listener changes. It does not replace the CLI or
introduce a general process supervisor.

Add no runtime dependency, public flag, config setting, provider, export,
proxy, authentication or expiry. Keep the Cloudflare pin and checksums,
Node.js 22+ support, argv launch and zero-config behavior. Do not release here.

## Current behavior and alternatives

`DevProcess.exit` currently maps the Execa result. That result includes root
exit and piped output completion. `runPeek` uses it for dev failure during
discovery, connection, readiness and retry delay. `cleanupDev` uses the same
promise to confirm termination and returns early when it fulfills.

These are different observations. A grandchild may retain a piped descriptor
after the root exits, delaying failure recognition. A grandchild with ignored
stdio may survive after the result settles. Execa's own delayed force kill
and parent-exit cleanup are cancelled when its result finishes.

Existing tree fixtures keep the parent alive until an ordinary descendant
exits. They prove the normal path, not root-first exit with a stubborn child.
Existing force tests exercise a direct dev process ignoring SIGTERM. Two
anonymous dev-output callbacks in `runPeek` have no explicit disposal.

These are source-based risks. Reproduce them before calling them bugs or
claiming a fix. Current upstream documentation and installed Execa 10 source
were checked; do not infer tree shutdown from an Execa result or a kill call.

The approved approach combines tests and small fixes in one PR. Separate
test-only and fix PRs would add a dependent review cycle. Replacing Execa
would broaden command resolution, stream and platform behavior to revalidate.

## Ownership and observations

Keep process details in the dev adapter. It owns the launch, direct process
status, output streams and termination capability. Core consumes observations
and requests shutdown; it does not enumerate unrelated processes or own a
second dev command.

Provide distinct internal observations for:

- Root exit or spawn failure, available without waiting for retained output
  pipes. Discovery and later orchestration use this for terminal dev failure.
- Cleanup completion, which checks the resources the adapter can actually
  identify and control. A root exit or closed pipe alone is insufficient.

Use explicit types and the existing process/error boundaries. Define concrete
field names and observable outcomes in the implementation plan. Reproductions
must verify those outcomes on each platform. Do not add a generic state framework.

Retain termination capability through cleanup even if the root's result has
already settled. Handle an already exited root without losing remaining
owned descendants. Do not signal arbitrary PIDs based only on a reused number
or an unverified process name. Keep external command execution in argv form.

Spawn failure and Windows missing-command detection must retain their existing
actionable diagnostics and exit classification. Unexpected observation failure
must be observed and reported, not become an unhandled rejection.

## Shutdown behavior

`Lifecycle` remains the single shutdown and signal owner. Preserve its cached,
idempotent stop promise, first outcome, provider-first order and cleanup result.

For dev cleanup, retain a three-second graceful waiting budget after SIGTERM
and a one-second forced confirmation budget after SIGKILL. A repeated signal
accelerates force cleanup and retains the first signal status. Resource
observation and any platform inspection must fit those bounded waits; do not
add a second unbounded promise or a delayed kill that outlives the operation.

Check resource shutdown even when root exit was observed first. If termination
or observation cannot be confirmed, return an actionable
`PROCESS_CLEANUP_ERROR`. Continue cleaning the other resource when one fails.
Preserve primary-before-distinct-cleanup diagnostics and statuses from
`docs/CLI.md`; do not invent a new exit code for this PR.

Observe late rejections, remove owned timers/listeners and release only the
handles whose cleanup is finished. Distinguish a completed cleanup attempt
from a claim that the operating system confirmed every resource stopped.

## Platform boundaries

On POSIX, Execa's `killDescendants` places the command in its own process
group. Group termination can reach surviving members after root exit. Verify
the adapter's termination and confirmation behavior with real processes,
including SIGTERM refusal and ignored or inherited output descriptors.

On Windows, Execa uses `taskkill /T /F` while the tree is intact; JavaScript
SIGTERM does not test a graceful POSIX handler. Test intact-tree shutdown and
root-first exit separately. Any fallback must use verified process identity,
bounded inspection and documented limits. Do not claim that direct root
termination proves descendant cleanup.

A fixture must record its process and listener checkpoints before assertions.
Distinguish a running orphan from a terminated zombie retained by the host's
reaper. Both observations belong in the evidence; do not relabel a zombie as
a running server or claim it was reaped when it was not. Test cleanup must
prevent a failed regression case from leaving a running process behind.

Deliberately detached descendants can escape ordinary group/tree ownership.
Record this boundary. Native job-object infrastructure or a new process
library would require a separate scope decision, not a silent expansion.
Native Windows console Ctrl+C remains separate from IPC handler coverage.

## Dev-output listeners and partial startup

Give core-owned stdout/stderr callbacks removable references and a bounded
lifetime. Keep normal dev output and startup diagnostics working. Prevent
callbacks or late output from continuing after core releases ownership.
Do not remove listeners owned by Execa or another caller.

Audit and test cancellation before spawn, after registration, during silent
discovery and during a pending tunnel connection. Retain earlier reconnect
and repeated-signal tests; add only cases that expose a missing boundary.
Late resource registration must receive bounded cleanup and cannot resume
readiness. Repeated runs must restore owned signal/listener counts.

## Selected-listener changes

The selected target remains fixed for one preview. Do not restart the dev
command, rediscover another port or retarget the provider when a supervisor
moves its server. Test a listener disappearing while the root stays alive,
a replacement server on another port and an unrelated listener taking the
old port, using local fixtures only.

Record the observed HTTP, readiness, retry and cleanup behavior for each case.
If a test demonstrates exposing an unrelated service or reusing an invalid
target, treat it as a v0.2 bug and fix it at the existing verification boundary.
Keep any check bounded and cancellable. Do not hide an unsafe result as a
successful compatibility test, or claim that one ownership check guarantees
ownership for the lifetime of every request. Continuous proxy/request controls
belong to v0.3 and must not be introduced here.

## Integration and stress cases

Use tiny Node fixtures with journalled checkpoints instead of framework
dependencies or arbitrary sleeps. Verify recorded PIDs, process states and
ports before fallback teardown. Preserve the real CLI command in a subprocess
and a deterministic local transport; normal CI must not contact Cloudflare.

| Scenario | Required behavior or investigation |
| --- | --- |
| Root exits before readiness while a child holds pipes | Recognize terminal dev failure without the 60-second discovery timeout; clean remaining owned resources. |
| Root exits after READY with a surviving grandchild | Stop the tunnel; do not reconnect or leave a serving owned descendant. |
| Root exits during retry delay | End recovery without another connection; retained pipes cannot postpone root-failure recognition. |
| Root exits quickly during SIGTERM; grandchild ignores it with separate stdio | Do not report successful cleanup solely from root/result settlement; force remaining owned resources within the budget. |
| Descendant retains inherited pipes | Shutdown remains bounded and releases owned stream/listener resources. |
| Ctrl+C during partial startup or silent discovery | No late READY or new process; first signal status retained. |
| Multiple signals while cleanup is unfinished | Accelerate force cleanup, retain first status, avoid duplicate ownership or unhandled promises. |
| Port disappears or server moves while root remains alive | Verify fixed-target behavior and record diagnostics; no automatic migration. |
| Unrelated service replaces the original listener | Demonstrate behavior; any exposure is a bug, not a passing result. |
| Repeated core runs | Owned signal/output/timer counts return to baseline. |

Use fake timers/process adapters for precise cleanup boundaries and rejected
observations. They supplement real process tests. Platform-specific cases run
or explicitly skip with a reason; passing IPC tests must not be labelled
native console tests. Keep existing HTTP/WebSocket, JSON, provider and retry
contracts passing.

## Documentation and delivery

Update the authoritative process/cleanup sections in `docs/ARCHITECTURE.md`
and test/platform guidance in `docs/DEVELOPMENT.md`. Link existing JSON and
exit policy where needed. Record tested behavior and significant limitations;
do not duplicate the exit table or write release notes before classification.

After written-spec approval, write the implementation plan. Run focused tests,
then lint, typecheck, test, build, pack:check and smoke:pack sequentially. Review
the diff with antislop, commit meaningfully, push and create/update this phase's
PR. Inspect required checks at the reviewed head, fix failures on this branch
and merge only when healthy. Inspect postmerge CI before the next phase.

Task 6 completion requires adversarial results and clear platform limits, not
only unit tests. Any remaining process or port blocker must be explicit in the
readiness report. Security-model documentation, actual framework dogfooding,
full installed-package flows and the v0.2.3 decision remain later phases.
