import { afterEach, expect, it } from 'vitest'
import {
  type CliEvent,
  type CliHandle,
  type JournalRecord,
  startCli,
} from '../helpers/cli.js'

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
  await stop(cli)
  expect(cli.stderr).toBe('')
}, 20_000)
