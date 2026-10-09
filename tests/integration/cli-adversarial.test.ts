import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'
import { type CliHandle, processState, startCli } from '../helpers/cli.js'

const handles: CliHandle[] = []
afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.dispose()
})

it('uses a bounded verified fallback when the CLI exits abruptly', async () => {
  const cli = await startCli({
    fixture: 'adversarial',
    env: { PEEK_TEST_REFUSE_TERM: '1' },
  })
  handles.push(cli)
  await cli.waitForEvent('ready')
  const descendant = await cli.waitForJournal('dev-descendant')
  if (descendant.pid === undefined) throw new Error('Missing descendant PID')
  // CIM has no fixture checkpoint; allow its first identity sample on Windows.
  if (process.platform === 'win32') await delay(2000)
  await cli.exitAbruptly()
  expect(await cli.waitForExit()).toEqual({ code: 23, signal: null })
  expect(processState(descendant.pid)).not.toBe('running')
  await expect(
    fetch(`http://127.0.0.1:${descendant.port}`, {
      signal: AbortSignal.timeout(1000),
    }),
  ).rejects.toThrow()
  // Abrupt exit bypasses Lifecycle, so only its dev-group fallback is promised.
  await cli.assertResourcesStopped()
})

// Windows cannot exercise a POSIX refusal handler; its creation identity cases
// below separately require native Windows execution.
it.skipIf(process.platform === 'win32').each(['ignore', 'inherit'] as const)(
  'stops a refusing descendant after its root exits with %s pipes',
  async (stdio) => {
    const cli = await startCli({
      fixture: 'adversarial',
      env: {
        PEEK_TEST_REFUSE_TERM: '1',
        PEEK_TEST_DESCENDANT_STDIO: stdio,
      },
    })
    handles.push(cli)
    await cli.waitForEvent('ready')
    const descendant = await cli.waitForJournal('dev-descendant')
    if (descendant.pid === undefined) throw new Error('Missing descendant PID')
    const url = `http://127.0.0.1:${descendant.port}`
    expect(await (await fetch(url)).text()).toBe('adversarial descendant')
    await cli.exitDevRoot()
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    const serving = await fetch(url, {
      signal: AbortSignal.timeout(1000),
    }).then(
      async (response) => await response.text(),
      () => false,
    )
    console.info(
      'root-first before fallback',
      JSON.stringify({
        descendant,
        state: processState(descendant.pid),
        serving,
        events: cli.events,
      }),
    )
    expect(serving).toBe(false)
    await cli.assertResourcesStopped()
  },
  15000,
)

it.skipIf(process.platform === 'win32')(
  'stops descendants when the dev root exits before READY',
  async () => {
    const cli = await startCli({
      fixture: 'adversarial',
      providerMode: 'connect-pending',
      env: { PEEK_TEST_REFUSE_TERM: '1' },
    })
    handles.push(cli)
    await cli.waitForJournal('connect-pending')
    await cli.exitDevRoot()
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    expect(cli.events.filter((event) => event.type === 'ready')).toHaveLength(0)
    expect(cli.events.filter((event) => event.type === 'error')).toHaveLength(1)
    await cli.assertResourcesStopped()
  },
)

it.skipIf(process.platform === 'win32')(
  'stops descendants when the dev root exits during reconnect backoff',
  async () => {
    const cli = await startCli({
      fixture: 'adversarial',
      providerMode: 'always-fail',
      env: { PEEK_TEST_REFUSE_TERM: '1', PEEK_TEST_RETRY_MS: '10000' },
    })
    handles.push(cli)
    await cli.waitForEvent(
      'warning',
      (event) => event.kind === 'reconnect-failed',
    )
    await cli.exitDevRoot()
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    expect(
      (await cli.readJournal()).filter(
        (record) => record.role === 'connection',
      ),
    ).toHaveLength(1)
    expect(cli.events.filter((event) => event.type === 'ready')).toHaveLength(0)
    await cli.assertResourcesStopped()
  },
)

it.runIf(process.platform === 'win32')(
  'stops tracked Windows root-first resources and reports unobserved ancestry separately',
  async () => {
    const cli = await startCli({ fixture: 'adversarial' })
    handles.push(cli)
    await cli.waitForEvent('ready')
    const descendant = await cli.waitForJournal('dev-descendant')
    if (descendant.pid === undefined) throw new Error('Missing descendant PID')
    await delay(2000)
    await cli.exitDevRoot()
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    const errors = cli.events.filter((event) => event.type === 'error')
    expect(errors).toHaveLength(2)
    expect(errors[0]?.message).toMatch(/Development server exited with code 7/)
    expect(errors[1]?.message).toMatch(/resource shutdown/)
    expect(processState(descendant.pid)).toBe('absent')
    await cli.assertResourcesStopped()
  },
)

it.skipIf(process.platform === 'win32')(
  'releases CLI handles after resource inspection fails without claiming termination',
  async () => {
    const tools = await mkdtemp(join(tmpdir(), 'peek-broken-inspector-'))
    let cli: CliHandle | undefined
    try {
      await symlink(process.execPath, join(tools, 'ps'))
      cli = await startCli({
        fixture: 'adversarial',
        timeoutMs: 2500,
        env: { PATH: `${tools}:${process.env.PATH}` },
      })
      handles.push(cli)
      await cli.waitForEvent('ready')
      const descendant = await cli.waitForJournal('dev-descendant')
      await cli.signal('SIGINT')
      expect(await cli.waitForExit()).toEqual({ code: 130, signal: null })
      expect(
        cli.events
          .filter((event) => event.type === 'error')
          .map((event) => event.message)
          .join(' '),
      ).toMatch(/resource shutdown/)
      if (descendant.pid === undefined)
        throw new Error('Missing descendant PID')
      expect(processState(descendant.pid)).toBe('running')
      expect(
        await (await fetch(`http://127.0.0.1:${descendant.port}`)).text(),
      ).toBe('adversarial descendant')
    } finally {
      await cli?.dispose()
      await rm(tools, { recursive: true, force: true })
    }
  },
)
