# v0.2 JSON Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Type, document, and independently test the thirteen existing JSON events without changing the v0.2 interface.

**Architecture:** One internal union and writer own JSON metadata and framing. The existing output interface still connects core callbacks to renderers. Independent test assertions inspect serialized bytes and real subprocess streams.

**Tech Stack:** Strict TypeScript, Node.js 22+, Vitest 5, the existing CLI integration harness. No new dependency.

---

## Context

Spec: `docs/superpowers/specs/2026-10-03-v02-json-contract-design.md`, approved in conversation. Baseline: `aaae639`, version 0.2.2. PRs #10 and #11 are merged. Work in `/tmp/peek-v02-hardening-20261003` on `test/v02-json-contract`, PR #12. The original project checkout contains user work and must remain untouched.

Context7 verification for this phase: Vitest's `toStrictEqual` checks undefined properties as well as values; `toMatchObject` permits extra fields; awaited `expect.poll` observes fresh values. Use complete fixed-field comparisons in renderer tests and required subsequences in process tests.

## Global Constraints

- Preserve schemaVersion 1, all thirteen event names, required payloads, and existing exit behavior.
- Runtime renderer events have ISO UTC wall-clock timestamps. Help and version omit timestamps.
- State and warning values remain open strings. URLs and formatted errors remain strings.
- Child output preserves chunks, newlines, quotes, and Unicode inside JSON events.
- Preserve reconnect policy and dev process ownership. Shutdown has no new event; consumers observe EOF and status.
- Keep terminal output, configuration precedence, provider behavior, package exports, dependencies, and version unchanged.
- Config is trusted code in Peek's process. Document direct stdout writes as a limitation; do not sandbox or suppress config output.
- Normal tests must not use public Cloudflare. Keep contract assertions in tests and runtime serialization free of schema validation.
- No v0.3 runtime behavior or fields. Each branch ends in a PR with the six local gates and all required CI passing on the reviewed commit.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `src/ui/json-event.ts` | Internal payload/wire union and newline writer; sole owner of metadata. |
| `src/ui/json-output.ts` | Map the existing output methods to typed payloads. |
| `src/cli-command.ts` | Use the writer for help/version; expose an internal doctor operation seam. |
| `tests/helpers/json-contract.ts` | Independently assert the current wire format; do not import production event types. |
| `tests/unit/json-output.test.ts` | All event shapes, escaping, optional fields, timestamp policy, invalid records. |
| `tests/helpers/cli.ts` | Write optional trusted config before launching a fixture. |
| `tests/fixtures/cli/entry.ts` | Inject real local doctor checks with its network operation replaced. |
| `tests/integration/cli-json.test.ts` | Shipped commands, config failures, doctor composition, config stdout limitation. |
| `tests/integration/cli-preview.test.ts` | Strengthen existing normal and eligible LAN stream assertions. |
| `tests/integration/cli-process.test.ts` | Strengthen existing crash, cleanup-error and reconnect streams and ordering. |
| `docs/JSON.md` | Authoritative user contract and compatibility policy. |
| `docs/CLI.md`, `docs/DEVELOPMENT.md`, `docs/ARCHITECTURE.md` | Links, measured test scope, and module ownership. |

### Task 1: Typed writer and independent wire assertions

**Files:** Create `src/ui/json-event.ts` and `tests/helpers/json-contract.ts`. Modify `src/ui/json-output.ts`, help/version in `src/cli-command.ts`, and `tests/unit/json-output.test.ts`.

- [ ] **Step 1: Replace the renderer test with complete event cases.**

```ts
import { afterEach, expect, it, vi } from 'vitest'
import { writeJsonEvent, type JsonEventInput } from '../../src/ui/json-event.js'
import { JsonOutput } from '../../src/ui/json-output.js'
import { readJsonEvents } from '../helpers/json-contract.js'

afterEach(() => vi.restoreAllMocks())

function capture(): () => string {
  let stdout = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk)
    return true
  })
  return () => stdout
}

const renderer = new JsonOutput()
const cases: { name: string; emit: () => void; payload: Record<string, unknown> }[] = [
  { name: 'start', emit: () => renderer.title(), payload: { type: 'start' } },
  { name: 'info', emit: () => renderer.info('info'), payload: { type: 'info', message: 'info' } },
  { name: 'state', emit: () => renderer.state('starting', 'starting'), payload: { type: 'state', state: 'starting', message: 'starting' } },
  { name: 'warning', emit: () => renderer.warning('tunnel-dropped', 'dropped'), payload: { type: 'warning', kind: 'tunnel-dropped', message: 'dropped' } },
  { name: 'success', emit: () => renderer.success('success'), payload: { type: 'success', message: 'success' } },
  { name: 'diagnostic', emit: () => renderer.diagnostic('diagnostic'), payload: { type: 'diagnostic', message: 'diagnostic' } },
  { name: 'child-output', emit: () => renderer.childOutput('stdout', 'stdout\n'), payload: { type: 'child-output', stream: 'stdout', content: 'stdout\n' } },
  { name: 'ready', emit: () => renderer.ready('http://localhost:3000', 'https://test.trycloudflare.com'), payload: { type: 'ready', localUrl: 'http://localhost:3000', publicUrl: 'https://test.trycloudflare.com' } },
  { name: 'lan-ready', emit: () => renderer.lanReady('http://192.168.1.2:3000'), payload: { type: 'lan-ready', url: 'http://192.168.1.2:3000' } },
  { name: 'error', emit: () => renderer.error('failed\nFix the command.'), payload: { type: 'error', message: 'failed\nFix the command.' } },
  { name: 'doctor-check', emit: () => renderer.doctorCheck({ name: 'node', status: 'pass', message: 'Node available' }), payload: { type: 'doctor-check', name: 'node', status: 'pass', message: 'Node available' } },
  { name: 'help', emit: () => writeJsonEvent({ type: 'help', text: 'peek --help\n' }), payload: { type: 'help', text: 'peek --help\n' } },
  { name: 'version', emit: () => writeJsonEvent({ type: 'version', version: '0.2.2' }), payload: { type: 'version', version: '0.2.2' } },
]

it.each(cases)('preserves the $name wire shape', ({ emit, payload }) => {
  const stdout = capture()
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  emit()
  const events = readJsonEvents(stdout())
  const staticEvent = payload.type === 'help' || payload.type === 'version'
  expect(events).toStrictEqual([{
    schemaVersion: 1,
    ...payload,
    ...(staticEvent ? {} : { timestamp: expect.any(String) }),
  }])
  expect(stderr).not.toHaveBeenCalled()
})

it.each(['stdout', 'stderr'] as const)('preserves escaped %s chunks', (stream) => {
  const stdout = capture()
  const content = 'quotes "hi"\\path\nsecond line\r\n日本語 🚀'
  renderer.childOutput(stream, content)
  expect(readJsonEvents(stdout())[0]).toMatchObject({ type: 'child-output', stream, content })
  expect(stdout().split('\n')).toHaveLength(2)
})

it.each(['pass', 'warn', 'fail'] as const)('serializes doctor status %s and optional strings', (status) => {
  const stdout = capture()
  renderer.doctorCheck({ name: 'check', status, message: 'message', remedy: 'remedy', detail: 'detail' })
  expect(readJsonEvents(stdout())[0]).toStrictEqual({ schemaVersion: 1, type: 'doctor-check', timestamp: expect.any(String), name: 'check', status, message: 'message', remedy: 'remedy', detail: 'detail' })
})

it('owns reserved metadata even for a structurally widened input', () => {
  const stdout = capture()
  writeJsonEvent({ type: 'help', text: 'help', schemaVersion: 99, timestamp: 'wrong' } as unknown as JsonEventInput)
  expect(readJsonEvents(stdout())).toStrictEqual([{ schemaVersion: 1, type: 'help', text: 'help' }])
})

it('rejects every missing required field in the current records', () => {
  const stdout = capture()
  for (const sample of cases) sample.emit()
  const events = readJsonEvents(stdout())
  for (const event of events) {
    for (const key of Object.keys(event)) {
      const missing = { ...event }
      delete missing[key]
      expect(() => readJsonEvents(`${JSON.stringify(missing)}\n`)).toThrow()
    }
  }
})

it.each([
  'human output\n',
  '{broken\n',
  'null\n',
  '{"schemaVersion":1,"type":"version","version":42}\n',
  '{"schemaVersion":1,"type":"version","version":"0.2.2"}',
  '{"schemaVersion":1,"type":"start","timestamp":"invalid"}\n',
  '{"schemaVersion":1,"type":"child-output","timestamp":"2026-10-03T00:00:00.000Z","stream":"other","content":"x"}\n',
  '{"schemaVersion":1,"type":"doctor-check","timestamp":"2026-10-03T00:00:00.000Z","name":"x","status":"other","message":"x"}\n',
])('rejects malformed contract input %s', (stdout) => {
  expect(() => readJsonEvents(stdout)).toThrow()
})
```

- [ ] **Step 2: Run the red test before creating the writer/helper.**

Run `pnpm exec vitest run tests/unit/json-output.test.ts`. Expected: import resolution failure for the new internal writer or test helper. Record the command and failing output.

- [ ] **Step 3: Create the internal payload/wire types and writer.**

`src/ui/json-event.ts`:

```ts
type RuntimeEventPayload =
  | { type: 'start' }
  | { type: 'info'; message: string }
  | { type: 'state'; state: string; message: string }
  | { type: 'warning'; kind: string; message: string }
  | { type: 'success'; message: string }
  | { type: 'diagnostic'; message: string }
  | { type: 'child-output'; stream: 'stdout' | 'stderr'; content: string }
  | { type: 'ready'; localUrl: string; publicUrl: string }
  | { type: 'lan-ready'; url: string }
  | { type: 'error'; message: string }
  | { type: 'doctor-check'; name: string; status: 'pass' | 'warn' | 'fail'; message: string; remedy?: string; detail?: string }

type CommandEventPayload =
  | { type: 'help'; text: string }
  | { type: 'version'; version: string }

export type JsonEventInput = (RuntimeEventPayload | CommandEventPayload) & {
  schemaVersion?: never
  timestamp?: never
}

export type PeekJsonEvent =
  | (RuntimeEventPayload & { schemaVersion: 1; timestamp: string })
  | (CommandEventPayload & { schemaVersion: 1; timestamp?: never })

export function writeJsonEvent(input: JsonEventInput): void {
  const { schemaVersion: _schemaVersion, timestamp: _timestamp, ...payload } = input
  const event: PeekJsonEvent =
    payload.type === 'help' || payload.type === 'version'
      ? { schemaVersion: 1, ...payload }
      : { schemaVersion: 1, timestamp: new Date().toISOString(), ...payload }
  process.stdout.write(`${JSON.stringify(event)}\n`)
}
```

Replace `src/ui/json-output.ts` with:

```ts
import type { DoctorCheck } from '../core/doctor.js'
import { writeJsonEvent } from './json-event.js'
import type { Output } from './output.js'

export class JsonOutput implements Output {
  title(): void { writeJsonEvent({ type: 'start' }) }
  info(message: string): void { writeJsonEvent({ type: 'info', message }) }
  state(state: string, message: string): void { writeJsonEvent({ type: 'state', state, message }) }
  warning(kind: string, message: string): void { writeJsonEvent({ type: 'warning', kind, message }) }
  success(message: string): void { writeJsonEvent({ type: 'success', message }) }
  diagnostic(message: string): void { writeJsonEvent({ type: 'diagnostic', message }) }
  childOutput(stream: 'stdout' | 'stderr', content: string): void { writeJsonEvent({ type: 'child-output', stream, content }) }
  ready(localUrl: string, publicUrl: string): void { writeJsonEvent({ type: 'ready', localUrl, publicUrl }) }
  lanReady(url: string): void { writeJsonEvent({ type: 'lan-ready', url }) }
  error(message: string): void { writeJsonEvent({ type: 'error', message }) }
  doctorCheck(check: DoctorCheck): void {
    writeJsonEvent({
      type: 'doctor-check', name: check.name, status: check.status, message: check.message,
      ...(check.remedy === undefined ? {} : { remedy: check.remedy }),
      ...(check.detail === undefined ? {} : { detail: check.detail }),
    })
  }
}
```

Add the writer import in `src/cli-command.ts` and replace only the two JSON writes:

```ts
import { writeJsonEvent } from './ui/json-event.js'

// In the existing JSON --version branch:
writeJsonEvent({ type: 'version', version: packageJson.version })

// In the existing wantsJson help branch:
writeJsonEvent({ type: 'help', text: help })
```

The contextual comments above locate edits; do not copy them into source.

- [ ] **Step 4: Create independent byte-level assertions.**

`tests/helpers/json-contract.ts`:

```ts
import { expect } from 'vitest'

const stringFields: Record<string, readonly string[]> = {
  start: [], info: ['message'], state: ['state', 'message'],
  warning: ['kind', 'message'], success: ['message'], diagnostic: ['message'],
  'child-output': ['stream', 'content'], ready: ['localUrl', 'publicUrl'],
  'lan-ready': ['url'], error: ['message'],
  'doctor-check': ['name', 'status', 'message'], help: ['text'], version: ['version'],
}

export function readJsonEvents(stdout: string): Record<string, unknown>[] {
  expect(stdout.length).toBeGreaterThan(0)
  expect(stdout.endsWith('\n')).toBe(true)
  return stdout.split('\n').filter((line) => line.trim()).map((line) => {
    const parsed: unknown = JSON.parse(line)
    expect(parsed).not.toBeNull()
    expect(typeof parsed).toBe('object')
    expect(Array.isArray(parsed)).toBe(false)
    const event = parsed as Record<string, unknown>
    expect(event.schemaVersion).toBe(1)
    if (typeof event.type !== 'string') throw new Error('Missing string event type')
    const fields = stringFields[event.type]
    if (!fields) throw new Error(`Unknown current event type: ${event.type}`)
    for (const field of fields) expect(typeof event[field]).toBe('string')
    if (event.type === 'help' || event.type === 'version') {
      expect(Object.hasOwn(event, 'timestamp')).toBe(false)
    } else {
      expect(typeof event.timestamp).toBe('string')
      const timestamp = String(event.timestamp)
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(Number.isFinite(Date.parse(timestamp))).toBe(true)
      expect(new Date(timestamp).toISOString()).toBe(timestamp)
    }
    if (event.type === 'child-output') expect(['stdout', 'stderr']).toContain(event.stream)
    if (event.type === 'doctor-check') {
      expect(['pass', 'warn', 'fail']).toContain(event.status)
      for (const field of ['remedy', 'detail']) {
        if (Object.hasOwn(event, field)) expect(typeof event[field]).toBe('string')
      }
    }
    for (const field of ['url', 'localUrl', 'publicUrl']) {
      if (Object.hasOwn(event, field)) {
        const url = new URL(String(event[field]))
        expect(['http:', 'https:']).toContain(url.protocol)
      }
    }
    return event
  })
}
```

- [ ] **Step 5: Format, test, typecheck, and commit.**

Run `pnpm exec biome check --write src/ui/json-event.ts src/ui/json-output.ts src/cli-command.ts tests/helpers/json-contract.ts tests/unit/json-output.test.ts`, then `pnpm exec vitest run tests/unit/json-output.test.ts tests/integration/cli.test.ts` and `pnpm typecheck`. Expected: all pass, with no new warning. Existing TypeScript experimental API warnings from the bundler are a known tooling observation; report them accurately.

Commit all five changed files: `git commit -m "test: type and freeze JSON event shapes"`. Record red/green evidence, exact commands and output, and concerns in the task report. No push yet.

### Task 2: Real CLI stream contracts

**Files:** Create `tests/integration/cli-json.test.ts`. Modify `src/cli-command.ts`, `tests/helpers/cli.ts`, `tests/fixtures/cli/entry.ts`, `tests/integration/cli-preview.test.ts`, and `tests/integration/cli-process.test.ts`.

- [ ] **Step 1: Add the shipped/config/doctor subprocess cases.**

`tests/integration/cli-json.test.ts`:

```ts
import { afterEach, expect, it } from 'vitest'
import packageJson from '../../package.json' with { type: 'json' }
import { type CliHandle, startCli } from '../helpers/cli.js'
import { readJsonEvents } from '../helpers/json-contract.js'

const handles: CliHandle[] = []
afterEach(async () => { await Promise.all(handles.splice(0).map((cli) => cli.dispose())) })

it.each(['--help', '--version'] as const)('keeps shipped %s stdout separate from stderr', async (flag) => {
  const cli = await startCli({ entry: 'shipped', project: true, args: ['--json', flag] })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 0, signal: null })
  const events = readJsonEvents(cli.stdout)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject(flag === '--version'
    ? { type: 'version', version: packageJson.version }
    : { type: 'help', text: expect.stringContaining('peek dev') })
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual(['cli'])
})

it.each([['--port', 'invalid'], ['--bogus'], ['run']])('frames shipped misuse %j as one error', async (...args) => {
  const cli = await startCli({ entry: 'shipped', project: true, args: ['--json', ...args] })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 2, signal: null })
  expect(readJsonEvents(cli.stdout).map((event) => event.type)).toEqual(['error'])
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual(['cli'])
})

it('frames invalid config without starting a provider or dev process', async () => {
  const cli = await startCli({ project: true, config: 'export default { port: 0 }\n' })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  const errors = readJsonEvents(cli.stdout).filter((event) => event.type === 'error')
  expect(errors).toHaveLength(1)
  expect(errors[0]?.message).toContain('Invalid peek.config.ts')
  expect(errors[0]?.message).toContain('Fix the configuration file')
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual(['cli'])
})

it.each([false, true])('frames doctor checks without an external network operation (invalid config: %s)', async (invalid) => {
  const cli = await startCli({
    project: true, args: ['doctor', '--json', '--verbose'],
    ...(invalid ? { config: 'export default { port: 0 }\n' } : {}),
  })
  handles.push(cli)
  expect((await cli.waitForExit()).code).toBe(invalid ? 1 : 0)
  const events = readJsonEvents(cli.stdout)
  expect(events[0]?.type).toBe('start')
  const checks = events.filter((event) => event.type === 'doctor-check')
  expect(checks.find((check) => check.name === 'peek')?.message).toBe(`Peek ${packageJson.version}`)
  expect(checks.find((check) => check.name === 'config')?.status).toBe(invalid ? 'fail' : 'pass')
  expect(checks.find((check) => check.name === 'network')?.status).toBe('pass')
  expect(checks.find((check) => check.name === 'network')?.detail).toEqual(expect.any(String))
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual(['cli'])
})

it('records that trusted config can write directly to stdout', async () => {
  const cli = await startCli({ project: true, config: 'console.log("config direct output")\nexport default { port: 0 }\n' })
  handles.push(cli)
  await expect(cli.waitForExit()).rejects.toThrow('Malformed CLI stdout: config direct output')
  await cli.assertResourcesStopped()
  expect(cli.stdout).toContain('config direct output\n')
  expect(() => readJsonEvents(cli.stdout)).toThrow()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual(['cli'])
})
```

- [ ] **Step 2: Run only the invalid-config case red.**

Run `pnpm exec vitest run tests/integration/cli-json.test.ts -t 'frames invalid config'`. Expected: failure because the harness has not yet written the config and the CLI stays running. This uses the deterministic local provider, never public Cloudflare. Do not run the doctor cases before its injected network operation is in place.

- [ ] **Step 3: Add the narrow doctor and config seams.**

In `src/cli-command.ts`, retain required provider preparation and add:

```ts
export interface CliDependencies {
  prepareProvider(options: ProviderPreparation): Promise<TunnelProvider>
  doctor?: typeof runDoctor
}

// Replace only the existing doctor's invocation expression:
const checks = await (dependencies?.doctor ?? runDoctor)({
  cwd: process.cwd(),
  verbose: args.verbose === true,
})
```

In `tests/helpers/cli.ts`, add `config?: string` to `CliOptions` and write it after the temporary package file and before args/spawn:

```ts
if (options.config !== undefined) {
  await writeFile(join(directory, 'peek.config.ts'), options.config)
}
```

In `tests/fixtures/cli/entry.ts`, add the import and dependency alongside provider preparation:

```ts
import { runDoctor } from '../../../src/core/doctor.js'

doctor: (options) => runDoctor({ ...options, networkCheck: async () => true }),
```

The seam is internal; production doctor still calls the original implementation. No production env switch or new CLI option. The injected result reports a substituted network operation and is not evidence of real Cloudflare reachability.

- [ ] **Step 4: Strengthen the existing preview, LAN and lifecycle assertions.**

Add `import { readJsonEvents } from '../helpers/json-contract.js'` to both process test files.

Replace the parse/metadata loop in the normal JSON test of `tests/integration/cli-preview.test.ts` with:

```ts
const events = readJsonEvents(cli.stdout)
expect(events.some((event) => event.type === 'start')).toBe(true)
expect(events.some((event) => event.type === 'state')).toBe(true)
expect(events.some((event) => event.type === 'ready')).toBe(true)
```

Retain its child stream separation, empty stderr and real HTTP/PID assertions. After the successful LAN case's existing stop, add:

```ts
expect(readJsonEvents(cli.stdout).filter((event) => event.type === 'lan-ready')).toHaveLength(1)
expect(cli.stderr).toBe('')
```

Keep the interface-based skip reason. Do not fabricate a LAN success.

Replace `assertJsonOnly` in `tests/integration/cli-process.test.ts` with:

```ts
function assertJsonOnly(cli: CliHandle): void {
  expect(readJsonEvents(cli.stdout)).toEqual(cli.events)
  expect(cli.stdout).not.toMatch(/\n\s+at |PeekError:|AggregateError:/)
  expect(cli.stderr).toBe('')
}
```

Call it after resource assertions in the dev-startup-crash case; its two cleanup error cases already call it. In the existing dropped-real-transport test, replace the last stderr assertion after `await stop(cli)` with:

```ts
assertJsonOnly(cli)
const events = readJsonEvents(cli.stdout)
const firstReady = events.findIndex((event) => event.type === 'ready')
const dropped = events.findIndex((event, index) => index > firstReady && event.type === 'warning' && event.kind === 'tunnel-dropped')
const reconnecting = events.findIndex((event, index) => index > dropped && event.type === 'state' && event.state === 'reconnecting')
const secondReady = events.findIndex((event, index) => index > reconnecting && event.type === 'ready')
expect(firstReady).toBeGreaterThanOrEqual(0)
expect(dropped).toBeGreaterThan(firstReady)
expect(reconnecting).toBeGreaterThan(dropped)
expect(secondReady).toBeGreaterThan(reconnecting)
expect(events.filter((event) => event.type === 'ready')).toHaveLength(2)
```

Retain the test's first/replacement HTTP requests, original PID/port, selected target ports, and cleanup before fallback teardown. Do not duplicate real subprocess scenarios merely to exercise the new assertion helper.

- [ ] **Step 5: Format, run the focused CLI gate, typecheck, and commit.**

Run `pnpm exec biome check --write src/cli-command.ts tests/helpers/cli.ts tests/fixtures/cli/entry.ts tests/integration/cli-json.test.ts tests/integration/cli-preview.test.ts tests/integration/cli-process.test.ts`.

Run `pnpm exec vitest run tests/unit/json-output.test.ts tests/integration/cli.test.ts tests/integration/cli-json.test.ts tests/integration/cli-preview.test.ts tests/integration/cli-process.test.ts`, then `pnpm typecheck`. Expected: pass with only the existing explicitly explained LAN/platform skips. Report actual counts, limitations, and red/green evidence.

Commit: `git commit -m "test: cover JSON contracts through real CLI streams"`. No push yet.

### Task 3: Contract documentation and package gate

**Files:** Create `docs/JSON.md`. Modify `docs/CLI.md`, `docs/DEVELOPMENT.md`, and `docs/ARCHITECTURE.md`. Do not modify production/test source in this task.

- [ ] **Step 1: Write the authoritative contract.**

Use the following content for `docs/JSON.md`; format the event table from the approved spec verbatim so required and optional fields have one user-facing location:

```markdown
# JSON output

`peek --json` writes newline-delimited JSON to stdout. Each nonempty line is
one object followed by a newline. Peek's logs and both dev-process streams
use events; human decoration and QR codes are disabled. Keep stderr separate
when consuming stdout.

This is a pre-1.0 interface. The v0.2 hardening pass preserves schema version 1
and existing event fields. Prefer additive optional fields and events;
consumers should ignore unknown fields, event types, state values and warning
kinds. Peek does not promise permanent v1 stability. Incompatible wire changes
will be documented in release notes and revise the schema version when
required. Pin package versions if your consumer needs unchanged behavior.

## Common fields and payloads

Every event has `schemaVersion: 1` and `type: string`. Runtime events also have
`timestamp`, the emission time from `new Date().toISOString()` in UTC.
`help` and `version` omit it. Timestamps are wall-clock values: they can repeat
or move backward. Use stdout order, not timestamp sorting.

Optional payload fields are absent when not supplied. Absence is not null.
```

Insert the thirteen-row payload table here, then continue:

```markdown
Current state values are `starting`, `waiting`, `connecting`, and `reconnecting`.
They are output values rather than internal lifecycle phases. Current warning
kinds include `blocked-host`, `hmr-failed`, `tunnel-dropped`, and
`reconnect-failed`. Both fields remain open strings; an unverified HMR check
uses an `info` message.

URLs are absolute strings. Cloudflare public URLs use HTTPS, local URLs use
`http://localhost:<port>`, and LAN URLs use the selected private IPv4 address.
Test providers can use loopback HTTP. A `ready` URL may change on reconnect;
do not infer a provider or fixed hostname from it.

`child-output.content` preserves each received chunk, including newlines,
quotes and Unicode. A chunk is not necessarily a complete log line. The
`stream` field identifies the child's original channel; both channels are
wrapped in events on Peek's stdout.

`error.message` contains the formatted diagnostic and remedy. It has no
structured error-code or stack field. Causes follow existing `--verbose`
behavior. Message prose and operating-system chunk sizes are not stable API.

## Reconnect and shutdown

A dropped tunnel emits `warning` with kind `tunnel-dropped`, then `state`
with value `reconnecting`. Failed replacement attempts can emit
`reconnect-failed` warnings. A successful replacement emits another `ready`
with the same local URL and a new public URL; the dev server keeps running.
Initial connection retries need not enter the reconnecting output state.
See [the lifecycle retry policy](ARCHITECTURE.md#progress-and-ownership).

There is no shutdown event. Observe EOF and process status. A primary failure
followed by a distinct cleanup failure can emit two `error` events, in that
order. A cleanup-only failure emits one. Do not treat the last event as a
successful shutdown marker or assume an exact transcript for independent
diagnostics.

Current exit statuses are 0 for successful completion, 1 for ordinary failure,
2 for CLI misuse, 130 for SIGINT, and 143 for SIGTERM. Live doctor requests a
normal stop after its checks. Peek's error/exit hardening phase may refine this
pre-1.0 policy; see release notes for changes.

## Trusted configuration

`peek.config.ts` executes trusted project code through jiti in Peek's process.
That code can write to or replace stdout independently of Peek's renderer.
The JSON contract covers Peek-produced events and wrapped dev output, with no
isolation guarantee for arbitrary config code. Keep config evaluation quiet
if a consumer needs an uninterrupted JSON stream.

## Consumer example

This Node.js example reads a piped stream. Run Peek separately and check its
exit status; the example's input EOF alone does not report Peek's success.

~~~js
import { createInterface } from 'node:readline'

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue
  const event = JSON.parse(line)
  if (event.schemaVersion !== 1) {
    throw new Error(`Unsupported Peek schema: ${event.schemaVersion}`)
  }
  switch (event.type) {
    case 'ready':
      console.error(`Preview: ${event.publicUrl}`)
      break
    case 'lan-ready':
      console.error(`LAN preview: ${event.url}`)
      break
    case 'error':
      console.error(event.message)
      break
  }
}
~~~

The consumer ignores other events and additional fields. Future optional
fields such as `access` or `expiresAt` can follow this policy; no such field
or behavior is implemented by this hardening pass.
```

- [ ] **Step 2: Link the contract and record measured coverage.**

In the `--json` row of `docs/CLI.md`, link `JSON.md` as the event contract. Keep only the concise option summary here.

In `docs/ARCHITECTURE.md`, add the explicit module ownership row:

```markdown
| `src/ui/json-event.ts` | Type the current JSON payloads and own metadata/framing for runtime, help and version events. |
```

Link to `JSON.md` beside the existing JSON/error discussion; do not duplicate the event table.

Add this section after the integration-test coverage in `docs/DEVELOPMENT.md`:

```markdown
## JSON contract tests

Run the focused contract checks with:

~~~sh
pnpm exec vitest run tests/unit/json-output.test.ts tests/integration/cli-json.test.ts tests/integration/cli-preview.test.ts tests/integration/cli-process.test.ts
~~~

The independent wire assertions cover all thirteen current event variants,
required fields, doctor optional fields/statuses, UTC timestamps, help/version
timestamp omissions, escaped chunks, malformed records and newline framing.
Real CLI tests keep stdout and stderr separate for help, version, misuse,
config errors, normal preview, eligible LAN preview, reconnect and cleanup
diagnostics. They check processes and listeners before fallback teardown.

The injected doctor runs real local checks and replaces only its network
operation; a passing fixture network check does not measure Cloudflare
reachability. A trusted config that logs directly to stdout deliberately
demonstrates the documented isolation limit. See [the JSON contract](JSON.md).
```

The authoritative contract's Node readline example is standard-library usage: check Context7 Node 22 documentation before committing that example.

- [ ] **Step 3: Run the full local and package gate once.**

Run sequentially: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm pack:check`, `pnpm smoke:pack`. Save each command's log in `/tmp/peek-v02-hardening-records/phase3/`. Expected: all pass; the package remains 0.2.2, with no new dependencies/exports or shipped test fixtures. Record the actual test counts, package listing, existing warning/skip reasons, and installed help/version/config-export smoke results. Do not claim packed previews or framework compatibility from this gate.

- [ ] **Step 4: Review prose and commit.**

Check changed docs against the spec and actual tests. Verify relative links exist, no generated marketing language, unsupported promises, or em dashes were added. Commit: `git commit -m "docs: define the pre-1.0 JSON interface"`. Record the verification evidence in the task report.

## Delivery after the three tasks

The primary agent runs the antislop delivery gate, a final whole-branch review, and any required focused fixes. It updates PR #12 with problem, motivation, implementation, architectural impact, tests, risks, compatibility and follow-up. Push the reviewed head, run `gh pr checks 12 --required`, and inspect all six required platform jobs. Keep the PR draft until required checks pass. Merge only the healthy reviewed head under the already authorized phase chain, then update clean local main before the next phase. Record any user-visible change for the final v0.2.3 decision; no release or next-phase implementation belongs to this branch.
