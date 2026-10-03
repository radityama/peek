import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { type CliHandle, startCli } from '../helpers/cli.js'

const handles: CliHandle[] = []
const listeners: Server[] = []
afterEach(async () => {
  try {
    await Promise.all(handles.splice(0).map((handle) => handle.dispose()))
  } finally {
    await Promise.all(
      listeners.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
            server.closeAllConnections()
          }),
      ),
    )
  }
})

async function listener(): Promise<{ server: Server; port: number }> {
  const server = createServer((_request, response) =>
    response.end('unrelated listener'),
  )
  listeners.push(server)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Fixture listener timed out')),
      3000,
    )
    server.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    server.listen(0, '127.0.0.1', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing listener port')
  return { server, port: address.port }
}

async function stop(cli: CliHandle): Promise<void> {
  await cli.signal('SIGINT')
  await cli.waitForExit()
  await cli.assertResourcesStopped()
}

async function assertPreview(cli: CliHandle): Promise<string> {
  const ready = await cli.waitForEvent('ready')
  const response = await fetch(String(ready.publicUrl), {
    signal: AbortSignal.timeout(3000),
  })
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('peek fixture')
  const selectedPort = Number(new URL(String(ready.localUrl)).port)
  const records = await cli.readJournal()
  expect(
    records.find((record) => record.role === 'dev' && record.port)?.port,
  ).toBe(selectedPort)
  const connections = records.filter((record) => record.role === 'connection')
  expect(connections).toHaveLength(1)
  expect(connections[0]?.targetPort).toBe(selectedPort)
  const transports = records.filter((record) => record.role === 'transport')
  expect(transports.length).toBeGreaterThan(0)
  expect(transports.every((record) => record.targetPort === selectedPort)).toBe(
    true,
  )
  return String(ready.publicUrl)
}

it('runs an injected preview from a normal project dev script', async () => {
  const cli = await startCli({ args: ['--json'], project: true })
  handles.push(cli)
  await assertPreview(cli)
  await stop(cli)
})

it.each(['announced', 'silent', 'delayed'] as const)(
  'runs an injected preview from an explicit command with a %s server',
  async (mode) => {
    const cli = await startCli({ mode })
    handles.push(cli)
    await assertPreview(cli)
    if (mode === 'silent') {
      expect(
        cli.events
          .filter((event) => event.type === 'child-output')
          .some((event) => String(event.content).includes('http://')),
      ).toBe(false)
    }
    await stop(cli)
  },
)

it('forwards HTTP method, path, body and headers through the real transport', async () => {
  const cli = await startCli()
  handles.push(cli)
  const url = await assertPreview(cli)
  const response = await fetch(`${url}/echo?fixture=1`, {
    method: 'PATCH',
    headers: { 'x-fixture-header': 'forwarded' },
    body: 'fixture request body',
    signal: AbortSignal.timeout(3000),
  })
  expect(response.headers.get('x-fixture-method')).toBe('PATCH')
  expect(response.headers.get('x-fixture-header')).toBe('forwarded')
  expect(response.headers.get('x-fixture-path')).toBe('/echo?fixture=1')
  expect(await response.text()).toBe('fixture request body')
  await stop(cli)
})

it('selects an explicitly requested initially free fixture port', async () => {
  const { server, port } = await listener()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  listeners.splice(listeners.indexOf(server), 1)
  const cli = await startCli({ args: ['--json', '--port', String(port)], port })
  handles.push(cli)
  await assertPreview(cli)
  expect(
    new URL(
      String(cli.events.find((event) => event.type === 'ready')?.localUrl),
    ).port,
  ).toBe(String(port))
  await stop(cli)
})

it('rejects an occupied unrelated port without tunnelling it', async () => {
  const { port } = await listener()
  const cli = await startCli({ args: ['--json', '--port', String(port)] })
  handles.push(cli)
  const error = await cli.waitForEvent('error')
  expect(error.message).toContain('already in use')
  expect((await cli.waitForExit()).code).toBe(1)
  expect(cli.events.some((event) => event.type === 'ready')).toBe(false)
  expect(
    (await cli.readJournal()).some(
      (record) => record.role === 'connection' || record.role === 'transport',
    ),
  ).toBe(false)
  expect(
    await (
      await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(3000),
      })
    ).text(),
  ).toBe('unrelated listener')
  await cli.assertResourcesStopped()
})

it('rejects an invalid port before preparing the provider', async () => {
  const cli = await startCli({ args: ['--json', '--port', 'invalid'] })
  handles.push(cli)
  expect((await cli.waitForEvent('error')).message).toContain('Invalid port')
  expect((await cli.waitForExit()).code).toBe(2)
  expect((await cli.readJournal()).map((record) => record.role)).toEqual([
    'cli',
  ])
  await cli.assertResourcesStopped()
})

it('surfaces malformed stdout instead of hiding it from JSON observers', async () => {
  const cli = await startCli({
    args: ['--json', '--version'],
    env: { PEEK_TEST_MALFORMED_STDOUT: '1' },
  })
  handles.push(cli)
  await expect(cli.waitForEvent('ready')).rejects.toThrow(
    'Malformed CLI stdout: fixture non-JSON stdout',
  )
  await expect(cli.waitForExit()).rejects.toThrow('Malformed CLI stdout')
  expect(cli.stdout).toContain('fixture non-JSON stdout')
  await cli.assertResourcesStopped()
})
