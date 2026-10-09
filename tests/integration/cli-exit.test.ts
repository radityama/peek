import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import packageJson from '../../package.json' with { type: 'json' }
import { type CliHandle, startCli } from '../helpers/cli.js'
import {
  isDevCleanupUncertainty,
  readJsonEvents,
} from '../helpers/json-contract.js'

const handles: CliHandle[] = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map((cli) => cli.dispose()))
})

const staticCases = [
  { args: ['--json=true', '--help'], mode: 'json', type: 'help' },
  { args: ['--json=false', '--help'], mode: 'human', type: 'help' },
  { args: ['--no-json', '--json', '--help'], mode: 'human', type: 'help' },
  { args: ['--json', '--no-json', '--help'], mode: 'human', type: 'help' },
  { args: ['--json', '--json=false', '--help'], mode: 'human', type: 'help' },
  { args: ['--json=false', '--json', '--help'], mode: 'json', type: 'help' },
  { args: ['--json=0', '--help'], mode: 'json', type: 'help' },
  { args: ['--json=true', '--version'], mode: 'json', type: 'version' },
  { args: ['--json=false', '--version'], mode: 'human', type: 'version' },
  { args: ['--no-json', '--version'], mode: 'human', type: 'version' },
  { args: ['--json', '-v'], mode: 'json', type: 'version' },
  { args: ['-v'], mode: 'human', type: 'version' },
  { args: ['--json=true', '-h'], mode: 'json', type: 'help' },
  { args: ['-h'], mode: 'human', type: 'help' },
  { args: ['--json', '--help', '--version'], mode: 'json', type: 'help' },
  { args: ['--json=true', '-v', '-h'], mode: 'json', type: 'help' },
  { args: ['--help', '--version'], mode: 'human', type: 'help' },
  { args: ['dev', '--json=true', '--help'], mode: 'json', type: 'help' },
  {
    args: ['doctor', '--json=true', '--version'],
    mode: 'json',
    type: 'version',
  },
  { args: ['doctor', '--json=false', '--help'], mode: 'human', type: 'help' },
  { args: ['--port', '--json', '--help'], mode: 'human', type: 'help' },
  {
    args: ['--json=true', '--help', '--', '--version'],
    mode: 'json',
    type: 'help',
  },
] as const

it.each(staticCases)(
  'static $args emits $mode $type without startup',
  async ({ args, mode, type }) => {
    const cli = await startCli({
      entry: 'shipped',
      project: true,
      args: [...args],
      outputMode: mode,
      config: 'throw new Error("static must not load config")',
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 0, signal: null })
    expect(cli.stderr).toBe('')
    if (mode === 'json') {
      const events = readJsonEvents(cli.stdout)
      expect(events).toHaveLength(1)
      expect(events[0]).toEqual(
        type === 'version'
          ? { schemaVersion: 1, type, version: packageJson.version }
          : {
              schemaVersion: 1,
              type,
              text: expect.stringContaining('peek dev'),
            },
      )
    } else {
      expect(cli.stdout).toEqual(
        type === 'version'
          ? `${packageJson.version}\n`
          : expect.stringContaining('peek dev'),
      )
    }
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it.each([
  {
    args: ['--json=true', '--port', 'invalid'],
    mode: 'json',
    message: 'Invalid port',
  },
  { args: ['--json=true', '--port'], mode: 'json', message: 'Invalid port' },
  {
    args: ['--json=false', '--port', 'invalid'],
    mode: 'human',
    message: 'Invalid port',
  },
  {
    args: ['--json', '--json=false', '--bogus'],
    mode: 'human',
    message: 'Unknown option',
  },
  {
    args: ['--json=false', '--json', 'run'],
    mode: 'json',
    message: 'Unknown command',
  },
  {
    args: ['--no-json', '--json', '--port', 'invalid'],
    mode: 'human',
    message: 'Invalid port',
  },
  {
    args: ['--json=true', '--lan', '--provider', 'cloudflare'],
    mode: 'json',
    message: 'private preview cannot',
  },
] as const)(
  'misuse $args retains status 2 and $mode stream',
  async ({ args, mode, message }) => {
    const cli = await startCli({
      entry: 'shipped',
      project: true,
      args: [...args],
      outputMode: mode,
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 2, signal: null })
    if (mode === 'json') {
      const events = readJsonEvents(cli.stdout)
      expect(events.map((event) => event.type)).toEqual(['error'])
      expect(events[0]?.message).toContain(message)
      expect(cli.stderr).toBe('')
    } else {
      expect(cli.stdout).toBe('')
      expect(cli.stderr).toContain(message)
    }
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it.each([false, true])(
  'config failures retain status 1 and control causes (verbose: %s)',
  async (verbose) => {
    const cli = await startCli({
      project: true,
      args: ['--json=true', ...(verbose ? ['--verbose'] : [])],
      outputMode: 'json',
      config:
        'const error = new Error("config cause marker"); error.stack = "CONFIG_STACK_MARKER"; throw error',
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    const events = readJsonEvents(cli.stdout)
    expect(events.map((event) => event.type)).toEqual(['error'])
    expect(events[0]?.message).toContain('Peek could not load peek.config.ts.')
    expect(events[0]?.message).toContain('Fix the configuration file')
    if (verbose)
      expect(events[0]?.message).toContain('Details: config cause marker')
    else expect(cli.stdout).not.toContain('config cause marker')
    expect(cli.stdout).not.toContain('CONFIG_STACK_MARKER')
    expect(cli.stderr).toBe('')
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it('keeps a missing dev script at status 1 before resource creation', async () => {
  const cli = await startCli({
    project: true,
    args: ['--json=true'],
    outputMode: 'json',
    packageJson: JSON.stringify({ name: 'peek-no-dev-fixture', scripts: {} }),
  })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  const events = readJsonEvents(cli.stdout)
  expect(events.map((event) => event.type)).toEqual(['error'])
  expect(events[0]?.message).toContain('Add scripts.dev')
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual([
    'cli',
  ])
})

it.each([false, true])(
  'provider preparation failures retain status 1 (verbose: %s)',
  async (verbose) => {
    const cli = await startCli({
      project: true,
      args: ['--json=true', ...(verbose ? ['--verbose'] : [])],
      outputMode: 'json',
      env: { PEEK_TEST_PREPARATION_FAILURE: '1' },
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    const errors = readJsonEvents(cli.stdout).filter(
      (event) => event.type === 'error',
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain('Retry tunnel preparation.')
    if (verbose)
      expect(errors[0]?.message).toContain('Details: fixture cache cause')
    else expect(cli.stdout).not.toContain('fixture cache cause')
    expect(cli.stderr).toBe('')
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
      'preparation',
    ])
  },
)

it('keeps unavailable command failure at status 1 and cleans partial startup', async () => {
  const cli = await startCli({
    project: true,
    args: ['--json=true'],
    outputMode: 'json',
    config: 'export default { command: ["peek-fixture-no-such-command"] }',
  })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  const errors = readJsonEvents(cli.stdout).filter(
    (event) => event.type === 'error',
  )
  const primary = errors.filter((event) => !isDevCleanupUncertainty(event))
  expect(primary).toHaveLength(1)
  expect(primary[0]?.message).toContain('peek-fixture-no-such-command')
  expect(errors.length).toBeLessThanOrEqual(2)
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
})

it('keeps a real dev crash at status 1 and cleans the prepared provider', async () => {
  const cli = await startCli({
    args: ['--json=true'],
    outputMode: 'json',
    mode: 'crash',
  })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  const errors = readJsonEvents(cli.stdout).filter(
    (event) => event.type === 'error',
  )
  const primary = errors.filter((event) => !isDevCleanupUncertainty(event))
  expect(primary).toHaveLength(1)
  expect(primary[0]?.message).toContain('7')
  expect(errors.length).toBeLessThanOrEqual(2)
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
})

it.each([false, true])(
  'doctor preserves remedies and verbose causes (verbose: %s)',
  async (verbose) => {
    const cli = await startCli({
      project: true,
      args: ['doctor', '--json=true', ...(verbose ? ['--verbose'] : [])],
      outputMode: 'json',
      config:
        'const error = new Error("doctor cause marker"); error.stack = "DOCTOR_STACK_MARKER"; throw error',
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
    const events = readJsonEvents(cli.stdout)
    const config = events.find(
      (event) => event.type === 'doctor-check' && event.name === 'config',
    )
    expect(config).toMatchObject({
      status: 'fail',
      message: 'Peek could not load peek.config.ts.',
      remedy:
        'Fix the configuration file or remove it to use automatic detection.',
    })
    if (verbose)
      expect(config?.detail).toContain('Details: doctor cause marker')
    else expect(config?.detail).toBeUndefined()
    expect(cli.stdout).not.toContain('DOCTOR_STACK_MARKER')
    if (!verbose) expect(cli.stdout).not.toContain('doctor cause marker')
    expect(cli.stderr).toBe('')
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it('keeps warning-only doctor at status 0', async () => {
  const cli = await startCli({
    project: true,
    args: ['doctor', '--json=true'],
    outputMode: 'json',
    env: { PEEK_TEST_NETWORK_REACHABLE: '0' },
  })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 0, signal: null })
  const checks = readJsonEvents(cli.stdout).filter(
    (event) => event.type === 'doctor-check',
  )
  expect(checks.find((check) => check.name === 'network')?.status).toBe('warn')
  expect(checks.some((check) => check.status === 'fail')).toBe(false)
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual([
    'cli',
  ])
})

it('runs assigned-JSON preview and preserves application flags after --', async () => {
  const fixture = fileURLToPath(
    new URL('../fixtures/cli/server.mjs', import.meta.url),
  )
  const applicationArgs = ['--json=false', '--help', '--version']
  const cli = await startCli({
    project: true,
    outputMode: 'json',
    args: ['--json=true', '--', process.execPath, fixture, ...applicationArgs],
  })
  handles.push(cli)
  const ready = await cli.waitForEvent('ready')
  const response = await fetch(String(ready.publicUrl), {
    signal: AbortSignal.timeout(3000),
  })
  expect(await response.text()).toBe('peek fixture')
  const dev = await cli.waitForJournal(
    'dev',
    (record) => record.argv !== undefined,
  )
  expect(dev.argv).toEqual(applicationArgs)
  await cli.signal('SIGINT')
  expect(await cli.waitForExit()).toEqual({ code: 130, signal: null })
  expect(
    readJsonEvents(cli.stdout).some((event) => event.type === 'ready'),
  ).toBe(true)
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
})
