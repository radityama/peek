import { afterEach, expect, it } from 'vitest'
import {
  type CliEvent,
  type CliHandle,
  type JournalRecord,
  startCli,
} from '../helpers/cli.js'
import { readJsonEvents } from '../helpers/json-contract.js'

const handles: CliHandle[] = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.dispose()))
})

function devListener(records: JournalRecord[]): JournalRecord {
  const dev = records.find((record) => record.role === 'dev' && record.port)
  if (!dev?.pid || !dev.port) throw new Error('Missing journalled dev listener')
  return dev
}

async function assertHttp(ready: CliEvent): Promise<void> {
  const response = await fetch(String(ready.publicUrl), {
    signal: AbortSignal.timeout(3000),
  })
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('peek fixture')
}

async function stop(cli: CliHandle): Promise<void> {
  await cli.signal('SIGTERM')
  expect((await cli.waitForExit()).code).toBe(143)
  await cli.assertResourcesStopped()
}

function readyCount(cli: CliHandle): number {
  return cli.events.filter((event) => event.type === 'ready').length
}

function assertJsonOnly(cli: CliHandle): void {
  expect(readJsonEvents(cli.stdout)).toEqual(cli.events)
  expect(cli.stdout).not.toMatch(/\n\s+at |PeekError:|AggregateError:/)
  expect(cli.stderr).toBe('')
}

function transportListener(
  records: JournalRecord[],
  attempt = 1,
): JournalRecord {
  const transport = records.find(
    (record) =>
      record.role === 'transport' && record.attempt === attempt && record.port,
  )
  if (!transport?.pid || !transport.port)
    throw new Error(
      `Missing journalled transport listener for attempt ${attempt}`,
    )
  return transport
}

const signalCoverage =
  process.platform === 'win32'
    ? 'Windows IPC signal handler and real process tree cleanup'
    : 'POSIX real signal and process tree cleanup'
it.each([
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const)(`${signalCoverage}: %s exits with %i`, async (signal, code) => {
  const cli = await startCli({ mode: 'tree', project: true })
  handles.push(cli)
  await assertHttp(await cli.waitForEvent('ready'))
  const records = await cli.readJournal()
  for (const role of ['cli', 'dev', 'descendant', 'transport']) {
    expect(records.some((record) => record.role === role && record.pid)).toBe(
      true,
    )
  }
  await cli.signal(signal)
  expect(await cli.waitForExit()).toEqual({ code, signal: null })
  await cli.assertResourcesStopped()
})

it('reports a dev startup crash and stops without connecting a transport', async () => {
  const cli = await startCli({ mode: 'crash' })
  handles.push(cli)
  const error = await cli.waitForEvent('error')
  expect(error.message).toContain('Development server exited with code 7')
  expect((await cli.waitForExit()).code).toBe(1)
  expect(cli.events.some((event) => event.type === 'ready')).toBe(false)
  const records = await cli.readJournal()
  expect(records.some((record) => record.role === 'dev' && record.pid)).toBe(
    true,
  )
  expect(
    records.some((record) => ['connection', 'transport'].includes(record.role)),
  ).toBe(false)
  await cli.assertResourcesStopped()
  assertJsonOnly(cli)
})

it('recovers from the initial tunnel failure with the original dev PID and port', async () => {
  const cli = await startCli({ providerMode: 'fail-once' })
  handles.push(cli)
  const warning = await cli.waitForEvent(
    'warning',
    (event) => event.kind === 'reconnect-failed',
  )
  expect(warning.message).toContain('Fixture tunnel startup failed once')
  const original = devListener(await cli.readJournal())
  const ready = await cli.waitForEvent('ready')
  await assertHttp(ready)
  const records = await cli.readJournal()
  expect(devListener(records)).toEqual(original)
  expect(
    new Set(
      records.filter((record) => record.role === 'dev').map((r) => r.pid),
    ),
  ).toEqual(new Set([original.pid]))
  expect(Number(new URL(String(ready.localUrl)).port)).toBe(original.port)
  expect(
    records
      .filter((record) => record.role === 'connection')
      .map((record) => [record.attempt, record.targetPort]),
  ).toEqual([
    [1, original.port],
    [2, original.port],
  ])
  const transports = records.filter((record) => record.role === 'transport')
  expect(new Set(transports.map((record) => record.pid)).size).toBe(1)
  expect(transports.every((record) => record.attempt === 2)).toBe(true)
  await stop(cli)
  expect(cli.stderr).toBe('')
}, 20_000)

it(`${signalCoverage}: cancels discovery at the delayed dev checkpoint`, async () => {
  const cli = await startCli({
    mode: 'delayed',
    env: { PEEK_TEST_STARTUP_DELAY_MS: '30000' },
  })
  handles.push(cli)
  const waiting = await cli.waitForJournal('dev-startup-wait')
  expect(waiting.pid).toBeTypeOf('number')
  const records = await cli.readJournal()
  expect(records.some((record) => record.role === 'dev' && record.port)).toBe(
    false,
  )
  expect(records.some((record) => record.role === 'connection')).toBe(false)
  await cli.signal('SIGINT')
  expect(await cli.waitForExit()).toEqual({ code: 130, signal: null })
  expect(cli.events.some((event) => event.type === 'ready')).toBe(false)
  await cli.assertResourcesStopped()
  expect(cli.stderr).toBe('')
})

it(`${signalCoverage}: cancels initial connect with a listening transport`, async () => {
  const cli = await startCli({ providerMode: 'connect-pending' })
  handles.push(cli)
  const pending = await cli.waitForJournal('connect-pending')
  const records = await cli.readJournal()
  const dev = devListener(records)
  const transport = transportListener(records)
  expect(pending).toMatchObject({
    pid: transport.pid,
    port: transport.port,
    attempt: 1,
    targetPort: dev.port,
  })
  await assertHttp({
    type: 'fixture',
    publicUrl: `http://127.0.0.1:${transport.port}`,
  })
  await cli.signal('SIGINT')
  expect(await cli.waitForExit()).toEqual({ code: 130, signal: null })
  expect(cli.events.some((event) => event.type === 'ready')).toBe(false)
  await cli.assertResourcesStopped()
  expect(cli.stderr).toBe('')
})

it(`${signalCoverage}: cancels reconnect after a real transport drop`, async () => {
  const cli = await startCli({ providerMode: 'reconnect-pending' })
  handles.push(cli)
  const first = await cli.waitForEvent('ready')
  await assertHttp(first)
  const before = await cli.readJournal()
  const dev = devListener(before)
  const transport = transportListener(before)
  if (!transport.pid) throw new Error('Missing dropped transport PID')
  process.kill(transport.pid, 'SIGTERM')
  await cli.waitForEvent('warning', (event) => event.kind === 'tunnel-dropped')
  const pending = await cli.waitForJournal(
    'connect-pending',
    (record) => record.attempt === 2,
  )
  const replacement = transportListener(await cli.readJournal(), 2)
  expect(pending).toMatchObject({
    pid: replacement.pid,
    port: replacement.port,
    targetPort: dev.port,
  })
  expect(replacement.pid).not.toBe(transport.pid)
  expect(devListener(await cli.readJournal())).toEqual(dev)
  await assertHttp({
    type: 'fixture',
    publicUrl: `http://127.0.0.1:${replacement.port}`,
  })
  await cli.signal('SIGINT')
  expect(await cli.waitForExit()).toEqual({ code: 130, signal: null })
  expect(cli.events.filter((event) => event.type === 'ready')).toEqual([first])
  await cli.assertResourcesStopped()
  expect(cli.stderr).toBe('')
}, 20_000)

it.each([
  ['SIGINT', 'SIGTERM', 130],
  ['SIGTERM', 'SIGINT', 143],
] as const)(
  `${signalCoverage}: %s then %s forces cleanup and retains %i`,
  async (firstSignal, secondSignal, code) => {
    const cli = await startCli({ providerMode: 'disconnect-on-force' })
    handles.push(cli)
    await assertHttp(await cli.waitForEvent('ready'))
    const transport = transportListener(await cli.readJournal())
    await cli.signal(firstSignal)
    const waiting = await cli.waitForJournal('disconnect-wait')
    expect(waiting).toMatchObject({ pid: transport.pid, port: transport.port })
    // The second signal must reach an unfinished shutdown, while its transport still listens.
    await assertHttp({
      type: 'fixture',
      publicUrl: `http://127.0.0.1:${transport.port}`,
    })
    await cli.signal(secondSignal)
    expect(await cli.waitForExit()).toEqual({ code, signal: null })
    expect(readyCount(cli)).toBe(1)
    expect(await cli.readJournal()).toContainEqual({
      role: 'force-disconnect',
      pid: transport.pid,
      port: transport.port,
    })
    await cli.assertResourcesStopped()
    expect(cli.stderr).toBe('')
  },
)

it('fails when the dev server exits after readiness and closes its transport without reconnecting', async () => {
  const cli = await startCli()
  handles.push(cli)
  await assertHttp(await cli.waitForEvent('ready'))
  const records = await cli.readJournal()
  const dev = devListener(records)
  transportListener(records)
  if (!dev.pid) throw new Error('Missing dev PID')
  process.kill(dev.pid, 'SIGTERM')
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  const errors = cli.events.filter((event) => event.type === 'error')
  expect(errors).toHaveLength(1)
  expect(errors[0]?.message).toContain('Development server exited with code')
  expect(readyCount(cli)).toBe(1)
  expect(cli.events.some((event) => event.kind === 'tunnel-dropped')).toBe(
    false,
  )
  expect(
    (await cli.readJournal()).filter((record) => record.role === 'connection'),
  ).toHaveLength(1)
  await cli.assertResourcesStopped()
  assertJsonOnly(cli)
})

it.skipIf(process.platform === 'win32')(
  'POSIX SIGTERM-ignore keeps its listener until Peek escalates to SIGKILL (Windows process.kill terminates unconditionally)',
  async () => {
    const cli = await startCli({
      mode: 'ignore-sigterm',
      providerMode: 'connect-pending',
    })
    handles.push(cli)
    await cli.waitForJournal('connect-pending')
    const dev = devListener(await cli.readJournal())
    await cli.signal('SIGINT')
    const ignored = await cli.waitForJournal('dev-sigterm-ignored')
    expect(ignored).toMatchObject({ pid: dev.pid, port: dev.port })
    await assertHttp({
      type: 'fixture',
      publicUrl: `http://127.0.0.1:${dev.port}`,
    })
    expect(await cli.waitForExit()).toEqual({ code: 130, signal: null })
    expect(cli.events.some((event) => event.type === 'ready')).toBe(false)
    await cli.assertResourcesStopped()
    expect(cli.stderr).toBe('')
  },
)

it(`${signalCoverage}: renders a JSON cleanup error after a signal while retaining interrupt status`, async () => {
  const cli = await startCli({ providerMode: 'disconnect-error' })
  handles.push(cli)
  await assertHttp(await cli.waitForEvent('ready'))
  const transport = transportListener(await cli.readJournal())
  await cli.signal('SIGINT')
  expect(await cli.waitForExit()).toEqual({ code: 130, signal: null })
  expect(readyCount(cli)).toBe(1)
  const errors = cli.events.filter((event) => event.type === 'error')
  expect(errors).toHaveLength(1)
  expect(errors[0]?.message).toContain(
    'Tunnel cleanup failed to confirm shutdown.',
  )
  expect(errors[0]?.message).toContain(
    'Check for remaining dev or tunnel processes',
  )
  expect(await cli.readJournal()).toContainEqual({
    role: 'disconnect-error',
    pid: transport.pid,
    port: transport.port,
  })
  await cli.assertResourcesStopped()
  assertJsonOnly(cli)
})

it('renders the immediate dev crash before its distinct JSON cleanup error', async () => {
  const cli = await startCli({
    mode: 'crash',
    providerMode: 'disconnect-error',
  })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  expect(readyCount(cli)).toBe(0)
  const errors = cli.events.filter((event) => event.type === 'error')
  expect(errors).toHaveLength(2)
  expect(errors[0]?.message).toContain('Development server exited with code 7')
  expect(errors[0]?.message).toContain('fix its startup error')
  expect(errors[1]?.message).toContain(
    'Tunnel cleanup failed to confirm shutdown.',
  )
  expect(errors[1]?.message).toContain(
    'Check for remaining dev or tunnel processes',
  )
  const records = await cli.readJournal()
  expect(records.some((record) => record.role === 'dev' && record.pid)).toBe(
    true,
  )
  expect(records.some((record) => record.role === 'transport')).toBe(false)
  await cli.assertResourcesStopped()
  assertJsonOnly(cli)
})

it('replaces a dropped real transport while preserving the dev PID and port', async () => {
  const cli = await startCli()
  handles.push(cli)
  const first = await cli.waitForEvent('ready')
  await assertHttp(first)
  const before = await cli.readJournal()
  const original = devListener(before)
  const transport = before.find(
    (record) => record.role === 'transport' && record.pid,
  )
  if (!transport?.pid) throw new Error('Missing first transport PID')
  // Drop only after the initial request succeeded, so slow CI cannot race readiness.
  process.kill(transport.pid, 'SIGTERM')
  await cli.waitForEvent('warning', (event) => event.kind === 'tunnel-dropped')
  const replacement = await cli.waitForEvent(
    'ready',
    (event) => event.publicUrl !== first.publicUrl,
  )
  await assertHttp(replacement)
  expect(replacement.localUrl).toBe(first.localUrl)
  const records = await cli.readJournal()
  expect(devListener(records)).toEqual(original)
  expect(
    new Set(
      records.filter((record) => record.role === 'dev').map((r) => r.pid),
    ),
  ).toEqual(new Set([original.pid]))
  const transports = records.filter((record) => record.role === 'transport')
  expect(new Set(transports.map((record) => record.pid)).size).toBe(2)
  expect(
    transports.every((record) => record.targetPort === original.port),
  ).toBe(true)
  expect(
    records
      .filter((record) => record.role === 'connection')
      .map((r) => r.attempt),
  ).toEqual([1, 2])
  expect(
    records
      .filter((record) => record.role === 'connection')
      .every(
        (record) => record.targetUrl === `http://127.0.0.1:${original.port}/`,
      ),
  ).toBe(true)
  await stop(cli)
  assertJsonOnly(cli)
  const events = readJsonEvents(cli.stdout)
  const firstReady = events.findIndex((event) => event.type === 'ready')
  const dropped = events.findIndex(
    (event, index) =>
      index > firstReady &&
      event.type === 'warning' &&
      event.kind === 'tunnel-dropped',
  )
  const reconnecting = events.findIndex(
    (event, index) =>
      index > dropped &&
      event.type === 'state' &&
      event.state === 'reconnecting',
  )
  const secondReady = events.findIndex(
    (event, index) => index > reconnecting && event.type === 'ready',
  )
  expect(firstReady).toBeGreaterThanOrEqual(0)
  expect(dropped).toBeGreaterThan(firstReady)
  expect(reconnecting).toBeGreaterThan(dropped)
  expect(secondReady).toBeGreaterThan(reconnecting)
  expect(events.filter((event) => event.type === 'ready')).toHaveLength(2)
}, 20_000)
