import { afterEach, expect, it } from 'vitest'
import { type CliHandle, startCli } from '../helpers/cli.js'
import { readJsonEvents } from '../helpers/json-contract.js'

const handles: CliHandle[] = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.dispose()))
})

function jsonOnly(cli: CliHandle): void {
  expect(readJsonEvents(cli.stdout)).toEqual(cli.events)
  expect(cli.stderr).toBe('')
  expect(cli.stdout).not.toMatch(/\n\s+at |PeekError:|AggregateError:/)
}

async function attempts(cli: CliHandle): Promise<number[]> {
  return (await cli.readJournal())
    .filter((record) => record.role === 'connection')
    .map((record) => record.attempt ?? 0)
}

it.each(['json', 'human'] as const)(
  'ends initial exhaustion with actionable %s output and stopped resources',
  async (mode) => {
    const cli = await startCli({
      args: mode === 'json' ? ['--json'] : [],
      outputMode: mode,
      providerMode: 'always-fail',
      env: { PEEK_TEST_RETRY_MS: '1' },
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    expect(await attempts(cli)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const records = await cli.readJournal()
    expect(
      new Set(records.filter((r) => r.role === 'dev').map((r) => r.pid)).size,
    ).toBe(1)
    expect(
      new Set(records.filter((r) => r.role === 'transport').map((r) => r.pid))
        .size,
    ).toBe(8)
    expect(
      new Set(
        records.filter((r) => r.role === 'connection').map((r) => r.targetUrl),
      ).size,
    ).toBe(1)
    expect(cli.stdout + cli.stderr).toContain(
      'eight consecutive failures or drops',
    )
    expect(cli.stdout + cli.stderr).toContain('peek doctor')
    if (mode === 'json') {
      jsonOnly(cli)
      expect(
        cli.events.filter(
          (e) => e.type === 'warning' && e.kind === 'reconnect-failed',
        ),
      ).toHaveLength(8)
      expect(cli.events.filter((e) => e.type === 'ready')).toHaveLength(0)
      expect(cli.events.filter((e) => e.type === 'error')).toHaveLength(1)
    }
    await cli.assertResourcesStopped()
  },
  20000,
)

it('exhausts eight real short sessions while keeping one dev PID and target', async () => {
  const cli = await startCli({ env: { PEEK_TEST_RETRY_MS: '1' } })
  handles.push(cli)
  let offset = 0
  for (let attempt = 1; attempt <= 8; attempt++) {
    const ready = await cli.waitForEvent(
      'ready',
      (event) => cli.events.indexOf(event) >= offset,
    )
    const response = await fetch(String(ready.publicUrl), {
      signal: AbortSignal.timeout(3000),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('peek fixture')
    const transport = await cli.waitForJournal(
      'transport',
      (record) => record.attempt === attempt && record.port !== undefined,
    )
    if (!transport.pid) throw new Error('Missing transport PID')
    expect(new URL(String(ready.publicUrl)).port).toBe(String(transport.port))
    offset = cli.events.length
    process.kill(transport.pid, 'SIGTERM')
  }
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  expect(await attempts(cli)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  const records = await cli.readJournal()
  const dev = records.find((r) => r.role === 'dev' && r.port !== undefined)
  expect(dev?.pid).toBeTypeOf('number')
  expect(
    new Set(records.filter((r) => r.role === 'dev').map((r) => r.pid)).size,
  ).toBe(1)
  expect(
    records
      .filter((r) => r.role === 'connection')
      .every((r) => r.targetPort === dev?.port),
  ).toBe(true)
  expect(cli.events.filter((e) => e.type === 'ready')).toHaveLength(8)
  expect(
    cli.events.filter(
      (e) => e.type === 'warning' && e.kind === 'tunnel-dropped',
    ),
  ).toHaveLength(8)
  expect(
    cli.events.filter((e) => e.type === 'state' && e.state === 'reconnecting'),
  ).toHaveLength(8)
  expect(cli.events.filter((e) => e.type === 'error')).toHaveLength(1)
  jsonOnly(cli)
  await cli.assertResourcesStopped()
}, 20000)

const signalCoverage =
  process.platform === 'win32'
    ? 'Windows IPC signal handler'
    : 'POSIX process signal'
it.each([
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const)(
  `${signalCoverage}: %s cancels backoff with status %i and no new attempt`,
  async (signal, code) => {
    const cli = await startCli({
      providerMode: 'always-fail',
      env: { PEEK_TEST_RETRY_MS: '30000' },
    })
    handles.push(cli)
    await cli.waitForEvent(
      'warning',
      (event) => event.kind === 'reconnect-failed',
    )
    await cli.signal(signal)
    expect(await cli.waitForExit()).toEqual({ code, signal: null })
    expect(await attempts(cli)).toEqual([1])
    expect(cli.events.filter((e) => e.type === 'ready')).toHaveLength(0)
    jsonOnly(cli)
    await cli.assertResourcesStopped()
  },
)

it('dev exit during backoff stops recovery without another transport', async () => {
  const cli = await startCli({
    providerMode: 'always-fail',
    env: { PEEK_TEST_RETRY_MS: '30000' },
  })
  handles.push(cli)
  await cli.waitForEvent(
    'warning',
    (event) => event.kind === 'reconnect-failed',
  )
  const dev = await cli.waitForJournal(
    'dev',
    (record) => record.port !== undefined,
  )
  if (!dev.pid) throw new Error('Missing dev PID')
  process.kill(dev.pid, 'SIGTERM')
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  expect(await attempts(cli)).toEqual([1])
  expect(cli.events.filter((e) => e.type === 'error')).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('Development server exited with code'),
    }),
  ])
  jsonOnly(cli)
  await cli.assertResourcesStopped()
})
