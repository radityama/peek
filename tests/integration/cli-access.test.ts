import { afterEach, expect, it } from 'vitest'
import { type CliHandle, startCli } from '../helpers/cli.js'
import { readJsonEvents } from '../helpers/json-contract.js'

const handles: CliHandle[] = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map((cli) => cli.dispose()))
})

it('requires a password at the proxy and strips its credential before forwarding', async () => {
  const cli = await startCli({
    args: ['--json', '--password'],
    env: { PEEK_TEST_PASSWORD: 'correct horse battery staple' },
  })
  handles.push(cli)
  const ready = await cli.waitForEvent('ready')
  const url = String(ready.publicUrl)
  expect((await cli.waitForEvent('access')).mode).toBe('protected')
  expect((await fetch(url)).status).toBe(401)
  expect(
    (
      await fetch(url, {
        headers: {
          authorization: `Basic ${Buffer.from('peek:wrong').toString('base64')}`,
        },
      })
    ).status,
  ).toBe(401)
  const response = await fetch(`${url}/echo`, {
    headers: {
      authorization: `Basic ${Buffer.from('peek:correct horse battery staple').toString('base64')}`,
    },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('x-fixture-authorization')).toBe('')
  await cli.signal('SIGINT')
  expect((await cli.waitForExit()).code).toBe(130)
  await cli.assertResourcesStopped()
  expect(readJsonEvents(cli.stdout)).toEqual(cli.events)
})

it('keeps --private on loopback without preparing a tunnel', async () => {
  const cli = await startCli({ args: ['--json', '--private'] })
  handles.push(cli)
  const ready = await cli.waitForEvent('private-ready')
  expect(new URL(String(ready.url)).hostname).toBe('localhost')
  expect((await cli.waitForEvent('access')).mode).toBe('private')
  const caveat = await cli.waitForEvent('info', (event) =>
    String(event.message).includes('local network'),
  )
  expect(caveat.message).toContain('may still be reachable')
  expect(await (await fetch(String(ready.url))).text()).toBe('peek fixture')
  expect(
    (await cli.readJournal()).some((record) => record.role === 'connection'),
  ).toBe(false)
  await cli.signal('SIGINT')
  expect((await cli.waitForExit()).code).toBe(130)
  await cli.assertResourcesStopped()
})

it('expires the preview and cleans up its tunnel and dev process', async () => {
  const cli = await startCli({ args: ['--json', '--expires', '1s'] })
  handles.push(cli)
  await cli.waitForEvent('ready')
  const access = await cli.waitForEvent('access')
  expect(access.mode).toBe('public')
  expect(Date.parse(String(access.expiresAt))).toBeGreaterThan(
    Date.now() - 2000,
  )
  expect(await cli.waitForExit()).toEqual({ code: 0, signal: null })
  expect(
    cli.events.some(
      (event) =>
        event.type === 'info' && String(event.message).includes('expired'),
    ),
  ).toBe(true)
  await cli.assertResourcesStopped()
})

it.each([
  ['--public', '--password'],
  ['--private', '--password'],
  ['--private', '--provider', 'cloudflare'],
  ['--lan', '--password'],
  ['--expires', '25h'],
] as const)(
  'rejects unsafe access options before starting a server',
  async (...flags) => {
    const cli = await startCli({ args: ['--json', ...flags] })
    handles.push(cli)
    await cli.waitForEvent('error')
    expect((await cli.waitForExit()).code).toBe(2)
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it('reports explicit public mode while preserving unauthenticated access', async () => {
  const cli = await startCli({ args: ['--json', '--public'] })
  handles.push(cli)
  const ready = await cli.waitForEvent('ready')
  expect((await cli.waitForEvent('access')).mode).toBe('public')
  expect(await (await fetch(String(ready.publicUrl))).text()).toBe(
    'peek fixture',
  )
  await cli.signal('SIGINT')
  expect((await cli.waitForExit()).code).toBe(130)
  await cli.assertResourcesStopped()
})

it('rejects --password without an interactive terminal before preparing a tunnel', async () => {
  const cli = await startCli({
    entry: 'shipped',
    project: true,
    args: ['--json', '--password'],
  })
  handles.push(cli)
  expect((await cli.waitForEvent('error')).message).toContain(
    'interactive terminal',
  )
  expect((await cli.waitForExit()).code).toBe(2)
  expect((await cli.readJournal()).map((record) => record.role)).toEqual([
    'cli',
  ])
})
