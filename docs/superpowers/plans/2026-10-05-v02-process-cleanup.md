# v0.2 Adversarial Process Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect dev-root failure promptly and prove bounded cleanup of ordinary dev descendants, retained pipes and core-owned listeners.

**Architecture:** The dev adapter reports root exit separately from resource shutdown. Lifecycle remains the sole shutdown owner and applies its existing waiting budgets; runPeek disposes its output callbacks and rechecks the fixed listener before connecting a transport. Platform inspection belongs in the process or server adapter, not the CLI or provider.

**Tech Stack:** Strict TypeScript, Node 22+, installed Execa 10, Vitest 5 and the existing real CLI/loopback transport harness. No new dependency.

**Spec:** [approved process design](../specs/2026-10-05-v02-process-cleanup-design.md).

**Baseline:** main `2e1569b`; branch `fix/v02-process-cleanup`; draft PR #16.

---

## Global Constraints

- Distinguish root exit/spawn failure from confirmation that owned resources stopped. A fulfilled Execa result or closed pipe alone is not tree confirmation.
- Lifecycle remains the single signal and shutdown owner. Preserve provider-first cleanup, the dev three-second graceful and one-second forced waiting budgets, cached stop, first signal status and primary-before-distinct-cleanup diagnostics.
- Use verified process identity and argv execution. Do not kill unrelated processes by name or a reused numeric PID alone. Remove owned inspection jobs, timers and listeners when the cleanup attempt ends.
- Report unconfirmed termination through the existing PROCESS_CLEANUP_ERROR. Preserve missing-command classification, useful diagnostics, schemaVersion 1 and exit statuses.
- Keep one original dev command and selected target. Revalidation must be bounded and cancellable; do not rediscover, migrate, restart or introduce per-request proxy controls.
- Real tests assert journalled process states and ports before fallback teardown. Distinguish a terminated zombie from a running orphan and record the distinction.
- Windows intact-tree cleanup, root-first cleanup and IPC signal-handler tests are separate cases. Do not call IPC native console Ctrl+C coverage.
- Add no runtime dependency, public option, configuration, provider, package export, binary-pin change, v0.3 runtime or release change.
- Normal tests use tiny Node fixtures and a local transport. No public Cloudflare dependency or permanent framework installation.
- Apply TDD in vertical slices. Record the actual RED result before the smallest fix, then GREEN. A case that already passes is coverage, not a reproduced bug.
- Run final lint, typecheck, test, build, pack:check and smoke:pack sequentially. Test setup rebuilds dist.

## File ownership and contracts

| Files | Responsibility |
| --- | --- |
| src/core/process.ts | Task 1: root observation. Task 2: owned resource shutdown and local handle disposal. |
| src/core/process-tree.ts | Task 2, only if needed: bounded platform identity, termination and confirmation. |
| src/core/cleanup.ts, src/core/lifecycle.ts | Task 2: consume resource confirmation without replacing signal ownership or waiting budgets. |
| src/core/run.ts | Task 3: removable dev-output callbacks and fixed-target revalidation. |
| src/core/server.ts | Task 3: distinguish unavailable inspection from a confirmed empty listener set. |
| tests/fixtures/cli/adversarial.mjs, tests/helpers/cli.ts | Tasks 1 and 2: controlled root/descendant/pipe fixture and process-state evidence. Task 3: selected-listener controls. |
| tests/integration/process.test.ts | Tasks 1 and 2: actual dev adapter contracts, including spawn failure. |
| tests/integration/cli-adversarial.test.ts | Tasks 1 through 3: real CLI, retained pipes, descendants, signals and changed listeners. |
| tests/unit/cleanup.test.ts, tests/unit/lifecycle.test.ts | Task 2: resource-versus-root, rejection and exact bounded wait tests. |
| tests/integration/lifecycle.test.ts, tests/integration/server.test.ts | Task 3: repeated core runs, cancellation and revalidation contracts. |
| docs/ARCHITECTURE.md, docs/DEVELOPMENT.md | Task 4: authoritative behavior, commands and measured platform limits. |

Keep `DevProcess.exit: Promise<ProcessExit>` but make its meaning direct root
exit or spawn failure. Add these internal resource methods in Task 2:

```ts
waitForStop(signal: AbortSignal): Promise<void>
dispose(): void
```

`waitForStop` fulfills only after identified running resources stop. It rejects
on observation failure. Its signal cancels inspection, not the dev command;
Lifecycle still requests termination through `kill`. `dispose` is idempotent
and releases the adapter's local observation/stream handles after the cleanup
attempt. It is not evidence of OS termination. Update all fake DevProcess
objects to implement this contract; no optional production fallback to root exit.

Upstream evidence is in
`/tmp/peek-v02-hardening-records/phase6b/upstream-audit.json` and
`windows-identity-upstream.json`. Execa 10 source and Node 22 docs distinguish
exit, pipe completion, POSIX groups and Windows taskkill. Microsoft documents
PID/ParentProcessId reuse and CreationDate. Fetch further Context7 documentation
only when a material API detail is unresolved.

### Task 1: Recognize root exit independently of inherited pipes

**Files:**
- Create: `tests/fixtures/cli/adversarial.mjs`
- Create: `tests/integration/process.test.ts`
- Modify: `tests/helpers/cli.ts`
- Modify: `src/core/process.ts`

- [x] **Step 1: Add the controlled pipe fixture and one root-observation test**

Start the new fixture with this complete root/child path. The later tasks can
extend the control protocol; do not replace the ordinary HTTP/WS fixture.

```js
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const journal = (record) => appendFileSync(
  process.env.PEEK_TEST_JOURNAL,
  `${JSON.stringify(record)}\n`,
)

if (process.argv.includes('--descendant')) {
  journal({ role: 'dev-descendant', pid: process.pid })
  process.send?.({ type: 'descendant-ready' })
  const lifetime = setInterval(() => {
    const stopFile = process.env.PEEK_TEST_STOP_FILE
    if (stopFile && existsSync(stopFile)) {
      clearInterval(lifetime)
      journal({ role: 'descendant-fallback-stop', pid: process.pid })
      process.exit(0)
    }
  }, 25)
} else {
  journal({ role: 'dev', pid: process.pid })
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--descendant'], {
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  child.once('error', (error) => { throw error })
  child.once('message', async (message) => {
    if (message?.type !== 'descendant-ready') return
    journal({ role: 'root-exiting', pid: process.pid })
    await delay(1)
    process.exit(7)
  })
}
```

The actual adapter test below intentionally asserts root status before
terminating the held-pipe descendant. Test fallback always runs, including RED.

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { spawnDev } from '../../src/core/process.js'

const fixture = fileURLToPath(new URL('../fixtures/cli/adversarial.mjs', import.meta.url))

it('reports root exit before an inherited pipe closes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peek-root-exit-'))
  const journal = join(directory, 'journal.jsonl')
  const stopFile = join(directory, 'stop-descendant')
  await writeFile(journal, '')
  const dev = spawnDev({
    file: process.execPath,
    args: ['--input-type=module', '-e', `process.env.PEEK_TEST_JOURNAL=${JSON.stringify(journal)}; process.env.PEEK_TEST_STOP_FILE=${JSON.stringify(stopFile)}; await import(${JSON.stringify(pathToFileURL(fixture).href)})`],
  }, directory)
  try {
    const result = await Promise.race([
      dev.exit,
      delay(2000).then(() => 'root exit delayed by retained pipes'),
    ])
    expect(result).toMatchObject({ exitCode: 7, failed: true, spawnFailed: false })
    expect(await readFile(journal, 'utf8')).toContain('root-exiting')
  } finally {
    await writeFile(stopFile, 'stop')
    dev.kill('SIGKILL')
    await delay(50)
    await rm(directory, { recursive: true, force: true })
  }
})
```

Keep this as an argv argument, never shell interpolation. Record held-pipe/root
checkpoints before assertions. If slow startup consumes the observation window,
begin the bounded root-status assertion at the journalled root-exiting checkpoint
rather than increasing an arbitrary process-start timeout. Cancel the losing
timer in GREEN so the test owns no delayed callback after completion.
Bound and verify pipe closure before removing the fixture directory in fallback.
The stop file addresses this particular fixture, not a numeric process identity.
Do not kill journalled PID numbers after their original process already exited.

Expose the test-only fixture selection in CliOptions and startCli. Rename the
existing module-level fixture constant to ordinaryFixture, then choose the
local value before creating the temporary wrapper or command:

```ts
fixture?: 'ordinary' | 'adversarial'
```

```ts
const fixture = options.fixture === 'adversarial'
  ? fileURLToPath(new URL('../fixtures/cli/adversarial.mjs', import.meta.url))
  : ordinaryFixture
```

The wrapper and explicit command must both use that selected local file.
The default remains the ordinary fixture; production CLI code has no test flag.

- [x] **Step 2: Run RED**

Run `pnpm exec vitest run tests/integration/process.test.ts -t 'root exit'`.
Expected: the two-second sentinel wins while the child retains stdout/stderr.
Inspect journal evidence and make sure fallback kills the descendant.

- [x] **Step 3: Map the direct process events without waiting for Execa**

Use this root-observation implementation inside spawnDev after stream checks.
Keep an observed Execa result for its output/diagnostic and cleanup internals.
Remove only these named adapter-owned listeners when root status settles.

```ts
const nativeChild = child.nodeChildProcess
const exit = new Promise<ProcessExit>((resolve) => {
  const finish = (result: ProcessExit): void => {
    nativeChild.removeListener('exit', onExit)
    nativeChild.removeListener('error', onError)
    resolve(result)
  }
  const onExit = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
    finish({
      exitCode,
      failed: exitCode !== 0 || signal !== null,
      spawnFailed: false,
      ...(signal ? { message: `Development command terminated by ${signal}.` } : {}),
    })
  }
  const onError = (error: Error): void => {
    finish({ exitCode: null, failed: true, spawnFailed: true, message: error.message })
  }
  nativeChild.once('exit', onExit)
  nativeChild.once('error', onError)
  void child.then((result) => {
    finish({
      exitCode: result.exitCode ?? null,
      failed: result.failed,
      spawnFailed: result.failed && result.exitCode === undefined &&
        result.signal === undefined && !result.timedOut && !result.isCanceled,
      ...(result.shortMessage ? { message: result.shortMessage } : {}),
    })
  }, (error: unknown) => {
    finish({
      exitCode: null,
      failed: true,
      spawnFailed: false,
      message: `Development command observation failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  })
})
```

Return `exit` as DevProcess.exit. Preserve the resolver used by
isMissingWindowsCommand. Add a real unavailable-command test and a normal
zero-exit test before changing error behavior; assert spawnFailed/message
and stable classification rather than an Execa-specific prose string.
Keep Execa's existing synchronous validation throw for a NUL argument.
Use a POSIX oversized argument to exercise an actual post-validation Node spawn
failure: installed Execa returns a failed result without a native event or PID.
This must settle rather than wait for events from its dummy native child:

```ts
expect(() => spawnDev({ file: process.execPath, args: ['\0'] }, process.cwd()))
  .toThrow(/null bytes/)
```

```ts
it.skipIf(process.platform === 'win32')('settles a synchronous POSIX spawn failure without native events', async () => {
  const dev = spawnDev({
    file: process.execPath,
    args: ['-e', 'process.exit(0)', 'x'.repeat(3 * 1024 * 1024)],
  }, process.cwd())
  await expect(dev.exit).resolves.toMatchObject({ failed: true, spawnFailed: true })
})
```

The resource adapter in Task 2 must retain unexpected Execa completion errors
even if root status was already reported; observing them is not permission to
hide a distinct resource observation failure.

- [x] **Step 4: Verify and commit**

Run `pnpm exec vitest run tests/integration/process.test.ts tests/integration/cli-process.test.ts tests/integration/cli-exit.test.ts`,
then `pnpm lint` and `pnpm typecheck`. Expected: prompt root status, existing
CLI errors and signal cases pass. Record which existing cases do not yet prove
descendant cleanup. Commit `fix: observe dev root exit without waiting for pipes`.

### Task 2: Confirm dev resource shutdown within the existing budgets

**Files:**
- Modify: `src/core/process.ts`, `src/core/cleanup.ts`
- Create if separation is needed: `src/core/process-tree.ts`
- Modify only for the new resource contract: `src/core/lifecycle.ts`, fake DevProcess objects in tests
- Modify: `tests/fixtures/cli/adversarial.mjs`, `tests/helpers/cli.ts`
- Create: `tests/integration/cli-adversarial.test.ts`
- Modify: `tests/integration/process.test.ts`, `tests/unit/cleanup.test.ts`, `tests/unit/lifecycle.test.ts`

- [x] **Step 1: Reproduce false cleanup confirmation in one vertical slice**

Extend the fixture with a descendant HTTP listener, separate or inherited
stdout/stderr, a POSIX SIGTERM-refusal handler and a control-file command to
exit the root only after the descendant journal checkpoint. Record root,
descendant and listener PIDs/ports. The root stays alive until instructed;
an intact-tree Windows case must run separately from root-first termination.

The core cleanup contract test is:

```ts
it('does not confuse root exit with remaining resource shutdown', async () => {
  const stopped = deferred<void>()
  const process = dev(Promise.resolve(exited))
  process.waitForStop = vi.fn(() => stopped.promise)
  process.dispose = vi.fn()
  process.kill = vi.fn((signal) => {
    if (signal === 'SIGKILL') stopped.resolve()
  })
  const result = cleanupDev(process, new AbortController().signal)
  await vi.advanceTimersByTimeAsync(2999)
  expect(process.kill).not.toHaveBeenCalledWith('SIGKILL')
  await vi.advanceTimersByTimeAsync(1)
  expect(await result).toEqual({})
  expect(process.kill).toHaveBeenCalledWith('SIGKILL')
  expect(process.dispose).toHaveBeenCalledOnce()
})
```

Add one real CLI root-first/refusal case before the platform fix. Assert the
descendant still serves HTTP in RED and is stopped in GREEN, before fallback.
Then add inherited-pipe, dev-exit-before-READY and dev-exit-during-backoff
slices. Do not bulk-add every adversarial case before fixing the first one.

- [x] **Step 2: Run and record each RED**

Run `pnpm exec vitest run tests/unit/cleanup.test.ts -t 'remaining resource'`
and `pnpm exec vitest run tests/integration/cli-adversarial.test.ts` as each
case is introduced. Expected: the original cleanup incorrectly trusts root
exit, or the real descendant survives. Capture actual process state and HTTP
evidence; a fixture or compilation error is not the reproduced process bug.

- [x] **Step 3: Implement resource observation and consume it in cleanup**

Add the required waitForStop/dispose methods. Use this cleanup structure,
retaining the existing failure aggregation and messages where accurate:

```ts
const observation = new AbortController()
let stopped: Promise<void>
try {
  stopped = dev.waitForStop(observation.signal)
} catch (error) {
  stopped = Promise.reject(error)
}
try {
  const gracefulWait = boundedWait(stopped, 3_000, force)
  try { dev.kill('SIGTERM') } catch (error) {
    messages.push('The dev server graceful termination request failed.')
    causes.push(error)
  }
  const graceful = await gracefulWait
  if (graceful.kind === 'fulfilled') return failure(messages, causes)
  if (graceful.kind === 'rejected') {
    messages.push('Dev server cleanup failed to confirm resource shutdown.')
    causes.push(graceful.error)
  }
  try { dev.kill('SIGKILL') } catch (error) {
    messages.push('The dev server force termination request failed.')
    causes.push(error)
  }
  const forced = await boundedWait(stopped, 1_000)
  if (forced.kind !== 'fulfilled' && graceful.kind !== 'rejected') {
    messages.push('Dev resource shutdown could not be confirmed within its cleanup deadline.')
    if (forced.kind === 'rejected') causes.push(forced.error)
  }
  return failure(messages, causes)
} finally {
  observation.abort()
  dev.dispose()
}
```

The platform implementation follows the reproduction evidence, with these
concrete requirements. Its code is not prescribed before that evidence:

1. POSIX: retain the command's private process-group termination capability
   after root exit. Inspect running group members, excluding terminated
   zombies, before claiming success. Do not fall back to an arbitrary positive
   root PID after root exit. Prevent termination after ownership is released.
2. Windows: use bounded intact-tree termination and verify identity for any
   root-first fallback. Combine PID with creation evidence; numeric
   ParentProcessId alone is insufficient. Track descendants while ancestry
   is observable. If safe identity cannot be established, report unconfirmed
   cleanup rather than guessing. Do not add native job-object infrastructure.
3. All inspection and termination jobs must have an owner, a bounded lifetime
   and observed rejection. Stop them with the cleanup observation signal.
   Do not schedule a delayed force kill after the cleanup attempt.
4. Release local piped handles after the attempt so retained descriptors do
   not hold the CLI indefinitely. Handle disposal is distinct from successful
   termination. Keep unexpected failures actionable and do not swallow them.
5. Test already exited roots, ignored and inherited stdio, stubborn ordinary
   descendants, late observation rejection, repeated force and disposal.
   Use real OS processes for tree assertions and fake timers for exact waits.

Controller ruling after RED: replace Execa's independent dev cleanup and force
timer using `cleanup: false` and `forceKillAfterDelay: false` when the owned
adapter is installed, preserving a verified bounded best-effort abrupt-parent
fallback without another normal signal owner. Guard group identity before
signaling; PGID/state numbers alone do not authorize a newly reused group.
Windows tracking uses PID plus creation identities while ancestry is visible.
An unobserved root-first identity produces PROCESS_CLEANUP_ERROR, even if known
resources stopped. Test that conservative uncertainty separately from tracked
root-first and intact-tree success; retain primary-first/status/JSON policy.
The bounded Windows job may use creation-matched .NET process handles to
terminate children first and root last. Taskkill is not mandated; avoid a
nested orphanable command and an unpinned snapshot-to-PID kill. Retain primary
evidence for Windows PowerShell/.NET Framework-compatible APIs.

Measured sampling ruling: retain one synchronous root-anchor snapshot, use
direct Linux /proc group snapshots thereafter, and sample after a 100 ms delay
during the first second, then 250 ms on both POSIX and Windows. On this Linux
host, 100 full ps snapshots averaged 11.15 ms versus 3.40 ms for /proc.
Windows CPU cost is unmeasured. Between-sample loss of every known identity
must produce unconfirmed cleanup rather than authorize a reused group.

Extend the harness process-state assertion to report absent, running and
zombie separately. On Linux read `/proc/<pid>/stat`; on macOS use bounded ps;
on Windows absence and available identity evidence determine the result.
Do not turn the fallback teardown into the assertion or suppress live orphans.

- [x] **Step 4: Verify cancellation, precedence and repeated signals**

Run `pnpm exec vitest run tests/integration/process.test.ts tests/integration/cli-adversarial.test.ts tests/integration/cli-process.test.ts tests/integration/cli-reconnect.test.ts tests/unit/cleanup.test.ts tests/unit/lifecycle.test.ts`.
Expected: all supported cases pass, platform exclusions say why, first signal
status is retained, resources are not serving and cleanup observation ends.
Run `pnpm lint` and `pnpm typecheck`; commit
`fix: confirm bounded dev process tree shutdown`.

### Task 3: Dispose core output and revalidate the fixed listener

**Files:**
- Modify: `src/core/run.ts`, `src/core/server.ts`
- Modify: `tests/fixtures/cli/adversarial.mjs`, `tests/helpers/cli.ts`
- Modify: `tests/integration/cli-adversarial.test.ts`, `tests/integration/lifecycle.test.ts`, `tests/integration/server.test.ts`

- [x] **Step 1: Reproduce retained output ownership**

Use a real runPeek invocation and Lifecycle.setDev to capture its adapter.
After stopping, retain an unrelated data listener and emit a late data chunk;
the onDevOutput callback must not run. Repeat the case with multiple runs,
checking owned SIGINT/SIGTERM listener counts return to their starting values.
Add cancellation at onState('starting') and onState('waiting'); assert no
late ready, no extra command and bounded registered-resource cleanup.
Existing initial-connect and reconnect cancellation cases remain required.

The removable callback pattern is:

```ts
let disposeDevOutput: (() => void) | undefined
const onStdout = (chunk: Buffer | string): void => {
  const text = chunk.toString()
  signals.addChunk(text)
  options.onDevOutput?.('stdout', text)
}
const onStderr = (chunk: Buffer | string): void => {
  const text = chunk.toString()
  signals.addChunk(text)
  options.onDevOutput?.('stderr', text)
}
dev.stdout.on('data', onStdout)
dev.stderr.on('data', onStderr)
disposeDevOutput = () => {
  dev.stdout.removeListener('data', onStdout)
  dev.stderr.removeListener('data', onStderr)
}
```

Call disposeDevOutput in runPeek's finally before releasing the operation.
Remove only those callbacks. Observe both fulfillment and rejection of
root-status observation; do not leave the existing fire-and-forget then
capable of creating an unhandled rejection.

- [x] **Step 2: Run RED, apply the callback change and run GREEN**

Run `pnpm exec vitest run tests/integration/lifecycle.test.ts -t 'output|partial|repeated'`
before and after implementation. Expected: late output exposes the retained
callback before the fix; the fixed operation keeps caller-owned listeners
and restores owned signal counts. Commit
`fix: release dev output callbacks after preview shutdown`.

- [x] **Step 3: Investigate disappeared, moved and replaced listeners**

Extend the fixture's child control protocol to close its listener while
remaining alive, or listen on a new ephemeral port. Tests wait for a recorded
closed/moved checkpoint, then drop the real transport. A separate test starts
an unrelated local HTTP server on the original port after closure. The
provider must never receive the new port or reconnect to the unrelated server.
Keep the unrelated test server outside Peek's owned journal and close it in
test fallback. Record behavior while the original transport remains READY
separately; do not imply revalidation controls every request.

The server-boundary contract is:

```ts
export interface ListenerInspection {
  available: boolean
  ports: readonly number[]
}

export async function verifySelectedServer(
  pid: number | undefined,
  port: number,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  if (!(await probePort(port, signal))) {
    throw new PeekError('SERVER_DETECTION_ERROR',
      `The selected dev server on port ${port} is no longer reachable.`,
      'Restart Peek after the dev server is ready; Peek does not switch ports during a preview.')
  }
  const inspected = await inspectChildListeners(pid, signal)
  signal.throwIfAborted()
  if (inspected.available && !inspected.ports.includes(port)) {
    throw new PeekError('SERVER_DETECTION_ERROR',
      `Port ${port} no longer belongs to the selected dev process.`,
      'Stop the unrelated listener and restart Peek with the dev server port.')
  }
}
```

Implement inspectChildListeners by preserving the existing platform readers
but returning `{ available: true, ports }` for confirmed empty results and
`{ available: false, ports: [] }` for unavailable inspection. Keep
inspectChildListeningPorts as the existing startup convenience wrapper.
Propagate cancellation through bounded execFile calls. Windows direct-only
fallback is positive evidence for the root listener, not proof that no
descendant owns a listener. Do not weaken startup ownership checks.

- [x] **Step 4: Run listener RED, then revalidate outside recoverable tunnel errors**

Run `pnpm exec vitest run tests/integration/cli-adversarial.test.ts -t 'listener|port'`.
Expected: the original loop reconnects to an unavailable or unrelated listener.
After that reproduction, await verifySelectedServer before every connect and
after connection resolution before readiness. Race checks against root exit
and lifecycle cancellation with the existing waitForOutcome helper. Verification
failure is terminal; do not count it as a provider failure or emit another ready.
Use the same check before LAN readiness after address selection. Preserve
the original numeric loopback target, local display URL and dev PID.

Run `pnpm exec vitest run tests/integration/server.test.ts tests/integration/lifecycle.test.ts tests/integration/cli-adversarial.test.ts tests/integration/cli-preview.test.ts tests/integration/cli-reconnect.test.ts tests/integration/cli-websocket.test.ts`.
Expected: listener failures are actionable, no unrelated replacement transport
is published, no migration occurs and existing HTTP/WS/LAN/JSON flows pass.
Run lint and typecheck; commit `fix: recheck the selected dev listener before reconnecting`.

### Task 4: Document measured behavior and deliver the phase

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`
- Update task checkboxes and status: this plan and its spec

- [x] **Step 1: Write the authoritative behavior and limitations**

Add a root-versus-resource explanation to the process/cleanup architecture,
matching the actual adapter. Update the dev forced-wait table to resource
confirmation. Describe listener revalidation timing, fixed-target failure and
the remaining request-time ownership race without claiming proxy protection.
Document process-state evidence and separate native POSIX, Windows intact-tree,
root-first and IPC results. State any unconfirmed identity, detached descendant
or host-reaper limitation precisely. Link the existing CLI exit/JSON policies.

Add this focused command to Development, adjusted only if a listed test file
was not needed and its coverage resides in an existing file:

```sh
pnpm exec vitest run tests/integration/process.test.ts tests/integration/cli-adversarial.test.ts tests/integration/cli-process.test.ts tests/integration/cli-reconnect.test.ts tests/integration/lifecycle.test.ts tests/unit/cleanup.test.ts tests/unit/lifecycle.test.ts
```

Do not claim native Windows console Ctrl+C, live Cloudflare or framework
dogfooding from these tests. Record actual supported/skipped cases in the
phase report; Task 8 remains separate.

- [x] **Step 2: Review and run the delivery gates**

Run the task review, then a whole-branch review against main. Route source
findings through an implementer, with covering tests and scoped rereview.
The primary agent applies antislop to naming, comments, docs and evidence.
Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
`pnpm pack:check`, `pnpm smoke:pack` sequentially and record native results.
The packed smoke covers version/help/config import; broader installed preview
flows remain in cross-cutting validation. Commit `docs: explain process cleanup and listener revalidation`.

- [x] **Step 3: Publish, inspect and merge only a healthy PR**

Push this branch and update PR #16 with the problem, motivation, implementation,
architectural impact, tests, risks, compatibility and follow-up sections.
Inspect `gh pr checks 16 --required`, the exact head and all six matrix jobs
including their gate steps. Fix failures on this branch and rerun affected
local gates. Mark ready and squash merge only after required CI passes.
Pull main ff-only and inspect postmerge CI before beginning Task 7.
Archive this plan's SDD artifacts and disclose all rulings before removing
only its owned workspace.
