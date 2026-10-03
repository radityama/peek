# v0.2 CLI integration harness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise the existing preview CLI with real processes and deterministic local transports before changing its lifecycle or interfaces.

**Architecture:** Extract an internal callable CLI entry with one provider-preparation dependency. Build the shipped CLI and a test entry once per Vitest run, then run both as subprocesses. Test fixtures and transport stay outside the published package.

**Tech Stack:** Node.js 22+, TypeScript, Citty, Execa, tsdown, Vitest; no new dependencies.

## Scope and constraints

The [approved spec](../specs/2026-10-03-v02-integration-harness-design.md) is authoritative. Work only in `/tmp/peek-v02-hardening-20261003`, branch `chore/v02-integration-harness`. Preserve the original checkout and its untracked website. Do not change package version, dependencies, Cloudflare pins, lifecycle policy, JSON event names, or provider contract. Every task must leave existing tests passing. Do not merge or publish from a worker.

Use Context7 for dependency APIs where current documentation matters. Already checked: Node 22 process/signals/HTTP, Execa termination, Citty runMain, Vitest global setup, tsdown programmatic build. Check installed types when current docs differ from the pinned version.

## Files and ownership

| File | Responsibility | Task |
| --- | --- | --- |
| `src/cli.ts` | Shipped shebang entry invoking the default CLI | 1 |
| `src/cli-command.ts` | Existing command body and internal provider preparation seam | 1 |
| `tests/setup.ts` | One build before workers, provide injected entry path, remove temporary artifacts | 1 |
| `tests/fixtures/cli/entry.ts` | Test dependency composition and labelled IPC signal control | 1, 2 |
| `vitest.config.ts`, `tests/integration/cli.test.ts` | Shared setup and existing shipped-entry checks | 1 |
| `tests/helpers/cli.ts` | Child, journal, JSON, bounded waits, and fallback teardown | 2 |
| `tests/fixtures/cli/server.mjs` | Small HTTP/WS server with announced, silent, delayed, crash, tree and blocked-host modes | 2 |
| `tests/fixtures/cli/descendant.mjs` | Independently recorded descendant left to Peek cleanup | 2 |
| `tests/fixtures/cli/provider.ts` | Test provider owning a loopback transport process | 2 |
| `tests/fixtures/cli/transport.mjs` | Test-only HTTP and raw upgrade forwarding | 2 |
| `tests/integration/cli-preview.test.ts` | Startup, port, JSON, host and LAN flows | 2, 3 |
| `tests/integration/cli-process.test.ts` | Signals, descendants, failure and recovery | 3 |
| `tests/integration/cli-websocket.test.ts` | Valid WS handshake and echoed message | 3 |
| `docs/DEVELOPMENT.md` | Commands, injected versus shipped entry, platform limits | 3 |

## Shared interfaces

Task 1 defines the sole production seam:

```ts
import type { TunnelProvider } from './tunnel/types.js'

export interface ProviderPreparation {
  signal: AbortSignal
  onDownload: () => void
  onDiagnostic: ((line: string) => void) | undefined
  originHostHeader: 'localhost' | undefined
}

export interface CliDependencies {
  prepareProvider(options: ProviderPreparation): Promise<TunnelProvider>
}
```

`runCli(raw: string[], dependencies?: CliDependencies): Promise<void>` wraps the existing parsing and execution. The default dependency calls `ensureCloudflared` and constructs `CloudflareProvider`. It is not a package export. Task 2 replaces only the test entry's temporary rejecting factory.

Task 2 exposes the harness through `startCli(options)`, returning stdout/stderr captures, parsed events, `waitForEvent(type, predicate?)`, `waitForExit()`, `signal(name)`, `readJournal()`, `assertResourcesStopped()`, and `dispose()`. `dispose()` is fallback teardown and must never be called before the cleanup assertions it would otherwise mask. Each test registers its handle immediately with an awaited `afterEach` cleanup. Options distinguish the shipped entry from the injected entry and accept argv, fixture mode, environment, and project dev-script selection.

The journal is newline-delimited JSON in a per-test temporary directory. Fixture processes record role, PID, and port independently of CLI stdout. Provider preparation/connection records distinguish LAN and validation failures from tunnel activity. Test controls may use environment variables only in `tests/fixtures/cli/*`; production code must not read them.

## Task 1: Internal CLI entry and one-time build

**Files:** `src/cli.ts`, new `src/cli-command.ts`, new `tests/setup.ts`, new `tests/fixtures/cli/entry.ts`, `vitest.config.ts`, `tests/integration/cli.test.ts`.

- [ ] Add a subprocess test of the injected entry with `--json --version`; separately retain all existing `dist/cli.js` tests. It must fail before the entry exists and pass after setup builds it.
- [ ] Move the existing command body into `runCli`, retaining its ordering and diagnostics. Use the shared types above. The shipped entry becomes:

```ts
#!/usr/bin/env node

import { runCli } from './cli-command.js'

await runCli(process.argv.slice(2))
```

- [ ] Keep the real preparation dependency explicit:

```ts
async function prepareProvider(options: ProviderPreparation): Promise<TunnelProvider> {
  const binaryPath = await ensureCloudflared({
    signal: options.signal,
    onDownload: options.onDownload,
  })
  return new CloudflareProvider(
    binaryPath,
    undefined,
    options.onDiagnostic,
    options.originHostHeader,
  )
}
```

The CLI emits its existing preparing/ready diagnostics around the dependency call. Provider construction has no observable startup effects. Keep flags, help, doctor, configuration, updates, exit status and cleanup in the same command body.
- [ ] Create the initial test entry below. It permits version/help without a provider and intentionally refuses public preview until Task 2 supplies the fixture provider:

```ts
import { runCli } from '../../../src/cli-command.js'

await runCli(process.argv.slice(2), {
  prepareProvider: async () => {
    throw new Error('The test transport has not been configured')
  },
})
```

- [ ] Configure Vitest `globalSetup: ['tests/setup.ts']`. Setup uses tsdown's programmatic `build` to build the normal config once and an ESM Node 22 test entry with declarations disabled. The injected artifact goes into a unique temporary directory under `node_modules/.cache`, allowing external dependencies to resolve and keeping it outside `dist`. Provide its absolute path as `cliTestEntry` through Vitest's typed `ProvidedContext`. Teardown removes only that unique directory. Remove the existing per-file `beforeAll` build.
- [ ] Verify exact commands: `pnpm exec vitest run tests/integration/cli.test.ts` (existing and injected version tests pass), `pnpm typecheck` (no errors), `pnpm build` (only production entries), `pnpm pack:check` (no test entry). Format changed TypeScript with Biome. Review the move for behavioral changes.
- [ ] Commit: `refactor: add internal CLI composition seam`.

## Task 2: Real process harness and startup coverage

**Files:** new `tests/helpers/cli.ts`, `tests/fixtures/cli/server.mjs`, `descendant.mjs`, `provider.ts`, `transport.mjs`, `tests/integration/cli-preview.test.ts`; update `tests/fixtures/cli/entry.ts`.

- [ ] Start with an injected-entry test that reaches `ready` and fetches its returned preview URL. This must fail with the temporary preparation error from Task 1. Use this assertion pattern with the real harness:

```ts
const cli = await startCli({ args: ['--json'], project: true })
handles.push(cli)
const ready = await cli.waitForEvent('ready')
expect(await (await fetch(String(ready.publicUrl))).text()).toBe('peek fixture')
await cli.signal('SIGINT')
await cli.waitForExit()
await cli.assertResourcesStopped()
```

- [ ] Implement bounded subprocess observations using argv arrays and `process.execPath`. Capture stdout and stderr separately, parse complete JSON lines, retain a bounded diagnostic tail, and reject waits on timeout or premature child exit. Use Node's `close` for completed stream capture. Every socket/request wait has a timeout or abort signal. Register the child and directory immediately; `dispose` attempts graceful termination, escalates, then removes fixtures. Record resource PIDs separately in the journal and force any leftovers only after assertions fail.
- [ ] Build fixture projects with a real `package.json` dev script for the normal `peek` case and an explicit Node argv command for the other case. Quote a dev script executable path safely for npm's platform shell; the harness itself must never spawn a shell. Set CI/update eligibility for deterministic tests, without changing production update logic.
- [ ] The Node fixture binds port 0 by default, journals its selected port, and emits a loopback URL in announced mode. Silent mode emits no URL. Delayed mode begins listening after a short deterministic delay. Explicit-port mode accepts a supplied free port. Crash mode exits before readiness. Tree mode starts a long-lived descendant and journals its PID; its own shutdown handler does not terminate that descendant. Bind `0.0.0.0` only for LAN coverage. Emit identifiable stdout and stderr child messages for JSON assertions.
- [ ] Implement the test provider with the existing `TunnelProvider` interface. Journal preparation and every connection. Launch a real transport child to forward only the verified dev port. Return its local HTTP URL plus an exit promise. Disconnect awaits bounded TERM/KILL cleanup; force disconnect terminates the child. Startup-failure and one-drop modes operate once per fixture session and journal the attempt. Do not add a runtime provider option.
- [ ] The transport forwards HTTP method/path/body and headers to `127.0.0.1:<verified port>`, with an optional localhost Host override. Forward raw upgrade bytes and both `head` buffers. Track open sockets, destroy them during shutdown, and report the listener through IPC rather than CLI stdout.
- [ ] Add announced, silent, delayed, explicit command, and normal dev-script startup cases. For explicit ports, acquire an ephemeral port and release it before spawning; for occupied ports retain the unrelated listener until the failure assertion. Assert selected port equals the journal and provider target; assert the occupied unrelated listener is never tunneled. Check invalid port exits with the current code and no provider preparation. Check malformed stdout is surfaced by the harness rather than hidden.
- [ ] Verify `pnpm exec vitest run tests/integration/cli-preview.test.ts tests/integration/cli.test.ts`, `pnpm typecheck`, and changed-file Biome checks. Expect successful real HTTP responses and no leftover journalled PIDs. Commit `test: add real CLI preview integration harness`.

## Task 3: Lifecycle, JSON, LAN and WebSocket acceptance

**Files:** update `tests/integration/cli-preview.test.ts`, new `tests/integration/cli-process.test.ts`, new `tests/integration/cli-websocket.test.ts`, update fixture files and `docs/DEVELOPMENT.md`.

- [ ] Run the injected entry from a normal dev-script project with no CLI flags. Wait with `expect.poll` and an explicit deadline for the terminal public URL, parse that URL, fetch the expected HTTP response, then signal and assert process cleanup. This checks the default renderer while retaining the real CLI body.
- [ ] Assert every nonempty stdout line in a successful `--json` session parses, has schema version 1 and an event type, and preserves child stdout/stderr as separate `child-output` events. Stderr must contain no human CLI logging in these successful JSON flows. Freeze no new event names in this phase.
- [ ] Test SIGINT and SIGTERM after readiness on POSIX through real child signals, expecting 130 and 143. Assert the journalled dev, descendant, and transport are stopped before fallback teardown. On Windows, use an IPC test-entry command that invokes `process.emit(signal)` and label it handler coverage; verify real Execa descendant cleanup. Native Windows console Ctrl+C remains a documented later stress-test requirement.
- [ ] Test dev startup crash, initial tunnel failure followed by readiness, and a ready tunnel dropping followed by replacement readiness. The recovery tests assert the same original dev PID and port, a new transport PID, and HTTP response from the replacement transport. Do not alter the current retry policy. Allow an explicit per-test timeout only where actual one/two-second retry delays require it.
- [ ] Exercise actual LAN interface selection. With exactly one private address, fetch the `lan-ready` URL and assert no preparation or connection journal records. Otherwise explicitly skip the successful-LAN test with its environment reason. Retain deterministic core missing/ambiguous-address tests and add only missing assertions. A LAN subprocess failure still proves no tunnel preparation.
- [ ] The blocked-host fixture rejects nonlocal Host values. Fetch through the transport to verify the rejection and assert Peek's host warning without a false HMR failure. Also verify the existing localhost Host override through the injected preparation options, without changing runtime behavior.
- [ ] Add a valid WebSocket echo endpoint and client using Node crypto/HTTP/net, without a dependency. Compute and verify the RFC handshake accept value:

```ts
import { createHash } from 'node:crypto'

function websocketAccept(key: string): string {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
}
```

The client sends a masked small text frame, reads the complete unmasked echo frame, and checks the message text. A 101 alone must not pass. Close the socket and assert transport/dev cleanup. Use bounded reads that handle chunk fragmentation.
- [ ] Update development documentation with the actual focused commands, distinction between shipped and injected entries, local transport limitations, explicit LAN skips, Windows handler versus native console coverage, and existing opt-in live-tunnel commands. Record any discovered behavior bug for its later focused phase rather than changing unrelated runtime code.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm pack:check`, `pnpm smoke:pack`. All must pass. Confirm packed files contain no test entry, transport, fixture or helper. Check `git diff --check` and review naming, comments and docs with antislop. Commit `test: cover CLI cleanup and local transport recovery`.

## PR completion

The controller reviews the whole branch after task reviews, pushes to the existing PR #10, updates its title/body with problem, motivation, implementation, architecture, tests, risk, compatibility and follow-up, and marks it ready. Inspect `gh pr checks 10`; fix required failures on this branch and do not call the phase complete while CI fails. Do not start the lifecycle branch until this PR is merged and local main has been updated.

## Plan review

| Requirement | Task |
| --- | --- |
| Production CLI unchanged, narrow seam, no test package exports | 1 |
| Shared builds, separate streams, bounded waits and teardown | 1, 2 |
| Real startup, silent/delayed, port ownership and failure | 2 |
| JSON purity, LAN provider exclusion and actual interfaces | 3 |
| POSIX signals, Windows handler/tree distinction, descendants | 3 |
| Tunnel recovery preserves dev server | 3 |
| Real blocked Host and WebSocket message | 3 |
| Documentation, complete gate, packed artifact and PR CI | 3, controller |

Task 1's provided path and preparation types are shared with Task 2. Task 2's harness methods, journal and fixture modes are shared with Task 3. Each pair uses the same names and ownership described above. The temporary rejecting provider is deliberately replaced before PR readiness. No lifecycle model, retry cap, JSON schema redesign, provider target redesign, exit mapping, threat model or framework compatibility claim is part of this branch.
