# v0.2 Provider Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Tunnel an explicit verified loopback HTTP target while preserving startup, output and cleanup behavior.

**Architecture:** Core passes a URL to the generic provider and observes a TunnelSession's URL and exit. A tunnel preparation factory owns Cloudflare construction; Lifecycle retains provider cleanup before and after a session exists.

**Tech Stack:** Strict TypeScript, Node 22+, existing Execa/Citty, Vitest and deterministic Node fixtures.

## Authority and global constraints

Approved spec: `docs/superpowers/specs/2026-10-04-v02-provider-boundary-design.md`.
Branch: `refactor/v02-provider-boundary`, base main `8b19cef`; draft PR #13
already contains the spec. Do not change the original shared checkout.

- Add no provider, registry, dependency, package export, public-target option, proxy, authentication, expiry, request inspection or v0.3 runtime behavior.
- Keep provider cleanup callable before, during or after connect, including a rejected or cancelled connection.
- Preserve three graceful seconds plus one forced second in Cloudflare, and the lifecycle's five-second observation plus one-second force deadline.
- Preserve the strict Quick Tunnel parser, pinned binary digests, argv-only execution, diagnostics, 45-second connection deadline and localhost Host override.
- Accept only root HTTP URLs with canonical hostname 127.0.0.1, port 1 through 65535, no credentials, query or fragment. Empty URL port is HTTP port 80; preserve explicit :80 in argv.
- Preserve JSON, local display URLs, configuration precedence, reconnect events and the existing retry policy. No normal test depends on public Cloudflare.
- Run artifact-dependent tests, builds and packing sequentially. Do not run a build while tests use dist/cli.js.
- Use direct source edits, small modules and precise prose. No version, changelog or binary-pin change in this phase.

## File map

| File | Change |
| --- | --- |
| src/tunnel/types.ts | Target URL and session contract, then shared preparation context. |
| src/tunnel/cloudflare.ts | Validate and serialize the supplied local origin; retain all process behavior. |
| src/core/run.ts | Pass the verified loopback URL. |
| tests/unit/cloudflare.test.ts | Target validation/argv/session tests and migrated calls. |
| tests/unit/lifecycle.test.ts | Migrate its real-provider call without changing cleanup tests. |
| tests/fixtures/cli/provider.ts | Consume and journal target URL; import preparation from the tunnel types. |
| tests/helpers/cli.ts | Type target URL in the journal. |
| tests/integration/cli-preview.test.ts | Assert the target URL alongside real HTTP and port checks. |
| tests/integration/cli-process.test.ts | Assert reconnect targets alongside real process/transport checks. |
| src/tunnel/prepare.ts | Existing verified Cloudflare preparation factory. |
| src/cli-command.ts | Consume the factory and shared preparation context. |
| tests/integration/lifecycle.test.ts | Verify generic provider handoff with a real dev server. |
| docs/ARCHITECTURE.md | Authoritative provider, session and future insertion ownership map. |

### Task 1: Explicit target and session contract

**Files:** Modify `src/tunnel/types.ts`, `src/tunnel/cloudflare.ts`,
`src/core/run.ts`, `tests/unit/cloudflare.test.ts`,
`tests/unit/lifecycle.test.ts`, `tests/fixtures/cli/provider.ts`,
`tests/helpers/cli.ts`, `tests/integration/cli-preview.test.ts`,
`tests/integration/cli-process.test.ts`.

- [x] **Step 1: Add target contract tests before changing production.**

Append this describe block after fakeChild in `tests/unit/cloudflare.test.ts`:

```ts
describe('Cloudflare target contract', () => {
  it.each([1, 80, 41235, 65535])('uses the supplied local listener on port %i', async (port) => {
    const fake = fakeChild()
    const launch = vi.fn(() => fake.child)
    const provider = new CloudflareProvider('/tmp/cloudflared', launch)
    try {
      const connecting = provider.connect({
        target: new URL(`http://127.0.0.1:${port}/`),
        signal: new AbortController().signal,
      })
      fake.stderr.write('https://rapid-river.trycloudflare.com\n')
      const session = await connecting
      expect(launch).toHaveBeenCalledWith('/tmp/cloudflared', [
        'tunnel', '--url', `http://127.0.0.1:${port}`,
      ])
      expect(session.url).toBe('https://rapid-river.trycloudflare.com')
      fake.exit(17)
      await expect(session.exited).resolves.toEqual({ exitCode: 17 })
    } finally {
      fake.exit(0)
      await provider.disconnect()
    }
  })

  it.each([
    'https://127.0.0.1:3000/',
    'ftp://127.0.0.1:3000/',
    'http://localhost:3000/',
    'http://0.0.0.0:3000/',
    'http://[::]:3000/',
    'http://[::1]:3000/',
    'http://192.168.1.10:3000/',
    'http://example.com:3000/',
    'http://127.0.0.2:3000/',
    'http://user:secret@127.0.0.1:3000/',
    'http://:secret@127.0.0.1:3000/',
    'http://127.0.0.1:3000/nested',
    'http://127.0.0.1:3000/?token=secret',
    'http://127.0.0.1:3000/#fragment',
    'http://127.0.0.1:0/',
  ])('rejects invalid target %s before spawning', async (text) => {
    const fake = fakeChild()
    const launch = vi.fn(() => fake.child)
    const provider = new CloudflareProvider('/tmp/cloudflared', launch)
    const connecting = Promise.resolve().then(() => provider.connect({
      target: new URL(text), signal: new AbortController().signal,
    }))
    const rejected = expect(connecting).rejects.toMatchObject({
      code: 'TUNNEL_CONFIG_ERROR',
      message: 'Tunnel target must be a root HTTP URL on 127.0.0.1.',
    })
    try {
      await Promise.resolve()
      fake.stderr.write('https://rapid-river.trycloudflare.com\n')
      await rejected
      expect(launch).not.toHaveBeenCalled()
    } finally {
      fake.exit(0)
      await provider.disconnect()
    }
  })
})
```

- [x] **Step 2: Record the red run.**

Run `pnpm test tests/unit/cloudflare.test.ts`. Expect the new target tests
to fail against the port API; old successful cases still clean their fake
children in finally. Record the command and relevant failure in the report.

- [x] **Step 3: Replace src/tunnel/types.ts with this complete contract.**

```ts
export interface TunnelExit {
  exitCode: number | null
}

export interface TunnelSession {
  readonly url: string
  readonly exited: Promise<TunnelExit>
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

In `src/tunnel/cloudflare.ts`, import TunnelSession instead of
TunnelConnection and change all three local type uses to TunnelSession.
Insert this complete function before CloudflareProvider:

```ts
function targetArgument(target: URL): string {
  const port = Number(target.port || 80)
  if (
    target.protocol !== 'http:' ||
    target.hostname !== '127.0.0.1' ||
    target.username || target.password ||
    target.pathname !== '/' || target.search || target.hash ||
    !Number.isInteger(port) || port < 1 || port > 65535
  ) {
    throw new PeekError(
      'TUNNEL_CONFIG_ERROR',
      'Tunnel target must be a root HTTP URL on 127.0.0.1.',
      'Use http://127.0.0.1:<port>/ with port 1-65535 and no credentials, query, or fragment.',
    )
  }
  return `http://${target.hostname}:${port}`
}
```

Replace the start of connect through args construction with:

```ts
  connect(options: {
    target: URL
    signal: AbortSignal
  }): Promise<TunnelSession> {
    const { target, signal } = options
    signal.throwIfAborted()
    const origin = targetArgument(target)
    this.diagnostics.length = 0
    const args = ['tunnel', '--url', origin]
```

Keep every later process, parser, timer, cancellation and cleanup line unchanged.
The promise and settle types become:

```ts
    return new Promise<TunnelSession>((resolve, reject) => {
```

```ts
      const settle = (connection?: TunnelSession, error?: unknown): void => {
```

In `src/core/run.ts`, replace the one connect expression with:

```ts
            provider.connect({
              target: new URL(`http://127.0.0.1:${port}`),
              signal,
            }),
```

- [x] **Step 4: Migrate existing calls and the behavioral fixture.**

In `tests/unit/cloudflare.test.ts`, the existing calls in public-URL, Host
override, early-exit, config-conflict, connected helper and late-child identity
tests each replace `port: 3000,` with this field:

```ts
    target: new URL('http://127.0.0.1:3000'),
```

Replace the existing cancellation call with:

```ts
  const connecting = provider.connect({
    target: new URL('http://127.0.0.1:3000'),
    signal: controller.signal,
  })
```

In `tests/unit/lifecycle.test.ts`, replace its sole provider connect call with:

```ts
        tunnel.connect({
          target: new URL('http://127.0.0.1:3000'),
          signal: lifecycle.signal,
        }),
```

In `tests/fixtures/cli/provider.ts`, rename imported/returned TunnelConnection
to TunnelSession. Leave the preparation type import for Task 2. Replace the
connect signature and first journal with:

```ts
  async connect({ target, signal }: {
    target: URL
    signal: AbortSignal
  }): Promise<TunnelSession> {
    signal.throwIfAborted()
    const port = Number(target.port || 80)
    const attempt = ++this.attempt
    journal({ role: 'connection', attempt, targetPort: port, targetUrl: target.href })
```

Keep fixture transport spawning and its port environment unchanged. In
`tests/helpers/cli.ts`, insert this optional field after targetPort:

```ts
  targetUrl?: string
```

In `tests/integration/cli-preview.test.ts`, after asserting the connection's
targetPort in assertPreview, insert:

```ts
  expect(connections[0]?.targetUrl).toBe(`http://127.0.0.1:${selectedPort}/`)
```

In `tests/integration/cli-process.test.ts`, in the ready/drop/replacement case
that checks transports against original.port, add this assertion after its
existing connection attempt assertion:

```ts
  expect(
    records.filter((record) => record.role === 'connection')
      .every((record) => record.targetUrl === `http://127.0.0.1:${original.port}/`),
  ).toBe(true)
```

Keep existing connection-count, HTTP, WebSocket, LAN, PID and listener checks.

- [x] **Step 5: Verify, self-review and commit.**

Run `pnpm typecheck`, then `pnpm test tests/unit/cloudflare.test.ts
tests/unit/lifecycle.test.ts tests/integration/cli-preview.test.ts
tests/integration/cli-process.test.ts`. Expect all eligible cases to pass,
with only the existing local LAN/platform skips. Run `pnpm lint` and
`pnpm test` sequentially once before committing. Verify the diff contains
no cleanup/retry/parser change. Update this task's checkboxes and commit
only its files plus the plan with `refactor: tunnel an explicit loopback target`.

### Task 2: Preparation factory and generic core handoff

**Files:** Modify `src/tunnel/types.ts`, `src/cli-command.ts`,
`tests/fixtures/cli/provider.ts`, `tests/integration/lifecycle.test.ts`;
create `src/tunnel/prepare.ts`.

- [x] **Step 1: Add the generic-provider integration assertion.**

Import TunnelProvider into `tests/integration/lifecycle.test.ts`:

```ts
import type { TunnelProvider } from '../../src/tunnel/types.js'
```

Append this complete test. It uses the existing serverFile, lifecycles and
isRunning helpers, and checks real HTTP/PID/closed-listener outcomes before
its fallback cleanup:

```ts
it('passes the verified loopback URL to a generic provider', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  let target: URL | undefined
  let selectedPort: number | undefined
  let devPid: number | undefined
  let markReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => { markReady = resolve })
  const provider: TunnelProvider = {
    name: 'generic-test',
    connect: async (options) => {
      options.signal.throwIfAborted()
      target = options.target
      return { url: 'https://preview.peek.test', exited: new Promise<never>(() => {}) }
    },
    disconnect: vi.fn(async () => {}),
  }
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle, provider,
    onServerReady: (port) => { selectedPort = port },
    onReady: markReady,
    onDevOutput: (_stream, text) => {
      const match = /PID: (\d+)/.exec(text)
      if (match?.[1]) devPid = Number(match[1])
    },
  })
  try {
    await Promise.race([
      ready,
      running.then(() => { throw new Error('Preview stopped before readiness') }),
    ])
    expect(selectedPort).toBeTypeOf('number')
    expect(target).toBeInstanceOf(URL)
    expect(target?.href).toBe(`http://127.0.0.1:${selectedPort}/`)
    const address = target?.href ?? ''
    const response = await fetch(address, { signal: AbortSignal.timeout(3000) })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('peek fixture ready')
    lifecycle.requestStop()
    await expect(running).resolves.toBeUndefined()
    expect(provider.disconnect).toHaveBeenCalled()
    expect(devPid).toBeTypeOf('number')
    expect(isRunning(devPid ?? 0)).toBe(false)
    await expect(fetch(address, { signal: AbortSignal.timeout(1000) })).rejects.toThrow()
  } finally {
    lifecycle.requestStop()
    await running.catch(() => {})
  }
})
```

Run `pnpm test tests/integration/lifecycle.test.ts`. Expect PASS after Task 1.
This is a missing contract assertion, not a new behavior; do not invent a
failing result. Record the actual command/output.

- [x] **Step 2: Move the existing preparation implementation.**

Append this complete interface to `src/tunnel/types.ts`:

```ts
export interface ProviderPreparation {
  signal: AbortSignal
  onDownload: () => void
  onDiagnostic: ((line: string) => void) | undefined
  originHostHeader: 'localhost' | undefined
}
```

Create `src/tunnel/prepare.ts`:

```ts
import { ensureCloudflared } from '../cloudflared/binary.js'
import { CloudflareProvider } from './cloudflare.js'
import type { ProviderPreparation, TunnelProvider } from './types.js'

export async function prepareProvider(
  options: ProviderPreparation,
): Promise<TunnelProvider> {
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

In `src/cli-command.ts`, remove imports of ensureCloudflared and
CloudflareProvider. Replace the old TunnelProvider import with:

```ts
import { prepareProvider } from './tunnel/prepare.js'
import type { ProviderPreparation, TunnelProvider } from './tunnel/types.js'
```

Delete exactly its existing ProviderPreparation interface and private
prepareProvider function; both complete definitions above replace them.
Leave CliDependencies, preparation invocation, callbacks, cancellation,
registration, doctor and option/config parsing unchanged.

In `tests/fixtures/cli/provider.ts`, delete the preparation type import from
cli-command and include it in the existing tunnel types import:

```ts
import type {
  ProviderPreparation,
  TunnelExit,
  TunnelProvider,
  TunnelSession,
} from '../../../src/tunnel/types.js'
```

- [x] **Step 3: Verify the move and commit.**

Run `pnpm typecheck`, then `pnpm test tests/integration/lifecycle.test.ts
tests/integration/cli-cleanup.test.ts tests/integration/cli-preview.test.ts
tests/integration/cli-json.test.ts`. Expect PASS for all eligible cases.
Run `pnpm lint` and `pnpm test` once sequentially before committing.
Inspect the diff: production preparation must be identical apart from its
location/imports. No concrete Cloudflare/binary imports remain in CLI, run
or lifecycle. Update the task checkboxes and commit its files and the plan
with `refactor: move tunnel preparation behind the provider boundary`.

### Task 3: Ownership documentation and delivery evidence

**Files:** Modify `docs/ARCHITECTURE.md` and this plan. Store gate logs in
`/tmp/peek-v02-hardening-records/phase4/`, outside tracked source.

- [ ] **Step 1: Update the authoritative architecture map.**

In the Modules table replace the src/tunnel wildcard row with:

```md
| `src/tunnel/types.ts` | Local target, session/liveness and provider cleanup contract. |
| `src/tunnel/prepare.ts` | Prepare the verified managed Cloudflare provider; CLI composition consumes this factory. |
| `src/tunnel/cloudflare.ts` | Validate the loopback HTTP origin, start the transport, parse its public URL and confirm process shutdown. |
```

Replace execution lifecycle item 2 with:

```md
2. In public mode, the tunnel preparation factory verifies or downloads the
   pinned `cloudflared` binary before starting the dev server. Register the
   prepared provider for cleanup. LAN mode skips the tunnel engine.
```

Replace the final provider paragraph with this complete section:

````md
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
passes the selected, verified `http://127.0.0.1:<port>/` target; local display
URLs retain their existing localhost form. Cloudflare accepts root HTTP targets
on that numeric loopback address with a valid port and without credentials,
query or fragment. It rejects other origins before launching a process.

A `TunnelSession` reports the transport's public URL and termination. The
provider retains `disconnect()` and optional `forceDisconnect()` because
cleanup must also work when startup has not returned a session. `Lifecycle`
registers the provider before dev startup; `runPeek` disconnects before every
connect attempt. Reconnection preserves the dev process and verified target.
The session does not own the dev server or decide retry timing.

Cloudflare output parsing, process flags and config diagnostics stay inside
the tunnel implementation. Host-header compatibility remains the explicit
localhost override. Authentication, expiry and inspection are absent from
the transport contract. Doctor may inspect the managed engine as a diagnostic.

The future local proxy will enter after `server-ready` and before tunnel
connection. Its verified loopback listener becomes the provider target while
the dev URL remains the application target. Proxy readiness, ownership and
shutdown order must be integrated into the lifecycle when implemented. The
CLI and provider transport need no proxy authentication knowledge. Peek
currently has no local proxy.
````

Keep current retry, JSON, signal, error and cleanup descriptions unchanged.
No other document duplicates this ownership section.

- [ ] **Step 2: Run the six local gates sequentially and inspect the artifact.**

Run these commands individually, recording exit status and full output in
task3-lint.log, task3-typecheck.log, task3-test.log, task3-build.log,
task3-pack-check.log and task3-smoke-pack.log under the record directory:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
pnpm smoke:pack
```

Expect each exit 0; tests include the new target and generic-provider cases.
The existing local LAN skip and upstream tool warning/hint remain disclosed.
Inspect pack output for 0.2.2 and no fixtures/new exports/dependencies.
Installed smoke must pass help/version/config export; this is not packed
preview or public-tunnel dogfooding. Those remain later project gates.

- [ ] **Step 3: Self-review and commit documentation.**

Run `git diff --check` and inspect source/lockfile/package status. Check the
new prose against actual types, guard, CLI imports and tests. Mark this task
complete and commit docs/ARCHITECTURE.md and this plan with
`docs: map tunnel target and session ownership`. Report exact gate results,
artifact contents, platform limitations, warnings and commit in the report.

## Controller delivery checklist

- [ ] Resolve every task-review finding and cross-task verification item.
- [ ] Run one whole-branch review at main base 8b19cef; one combined fix wave
  and scoped re-review if it finds issues.
- [ ] Run the primary antislop gate on source, prose and PR description.
- [ ] Update draft PR #13's description with implementation/evidence/risks.
- [ ] Push the reviewed branch, inspect all six required CI jobs at its exact
  head, and fix failures on this branch. Mark ready only after healthy review/CI.
- [ ] Merge through the established gh workflow; update clean local main with
  ff-only and inspect post-merge CI before beginning another phase.
- [ ] Preserve the exhaustive rulings and costs, archive this plan's scratch
  records outside the repository, and remove only its owned scratch workspace.
- [ ] Keep version 0.2.2 and record provider phase status; the wider project
  and v0.2.3 decision remain incomplete.
