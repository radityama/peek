import { afterEach, expect, it } from 'vitest'
import packageJson from '../../package.json' with { type: 'json' }
import { type CliHandle, startCli } from '../helpers/cli.js'
import { readJsonEvents } from '../helpers/json-contract.js'

const handles: CliHandle[] = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map((cli) => cli.dispose()))
})

it.each(['--help', '--version'] as const)(
  'keeps shipped %s stdout separate from stderr',
  async (flag) => {
    const cli = await startCli({
      entry: 'shipped',
      project: true,
      args: ['--json', flag],
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 0, signal: null })
    const events = readJsonEvents(cli.stdout)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject(
      flag === '--version'
        ? { type: 'version', version: packageJson.version }
        : { type: 'help', text: expect.stringContaining('peek dev') },
    )
    expect(cli.stderr).toBe('')
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it.each([['--port', 'invalid'], ['--bogus'], ['run']])(
  'frames shipped misuse %j as one error',
  async (...args) => {
    const cli = await startCli({
      entry: 'shipped',
      project: true,
      args: ['--json', ...args],
    })
    handles.push(cli)
    expect(await cli.waitForExit()).toEqual({ code: 2, signal: null })
    expect(readJsonEvents(cli.stdout).map((event) => event.type)).toEqual([
      'error',
    ])
    expect(cli.stderr).toBe('')
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it('frames invalid config without starting a provider or dev process', async () => {
  const cli = await startCli({
    project: true,
    config: 'export default { port: 0 }\n',
  })
  handles.push(cli)
  expect(await cli.waitForExit()).toEqual({ code: 1, signal: null })
  const errors = readJsonEvents(cli.stdout).filter(
    (event) => event.type === 'error',
  )
  expect(errors).toHaveLength(1)
  expect(errors[0]?.message).toContain('Invalid peek.config.ts')
  expect(errors[0]?.message).toContain('Fix the configuration file')
  expect(cli.stderr).toBe('')
  await cli.assertResourcesStopped()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual([
    'cli',
  ])
})

it.each([false, true])(
  'frames doctor checks without an external network operation (invalid config: %s)',
  async (invalid) => {
    const cli = await startCli({
      project: true,
      args: ['doctor', '--json', '--verbose'],
      ...(invalid ? { config: 'export default { port: 0 }\n' } : {}),
    })
    handles.push(cli)
    expect((await cli.waitForExit()).code).toBe(invalid ? 1 : 0)
    const events = readJsonEvents(cli.stdout)
    expect(events[0]?.type).toBe('start')
    const checks = events.filter((event) => event.type === 'doctor-check')
    expect(checks.find((check) => check.name === 'peek')?.message).toBe(
      `Peek ${packageJson.version}`,
    )
    expect(checks.find((check) => check.name === 'config')?.status).toBe(
      invalid ? 'fail' : 'pass',
    )
    expect(checks.find((check) => check.name === 'network')?.status).toBe(
      'pass',
    )
    expect(checks.find((check) => check.name === 'network')?.detail).toEqual(
      expect.any(String),
    )
    expect(cli.stderr).toBe('')
    await cli.assertResourcesStopped()
    expect((await cli.readJournal()).map((record) => record.role)).toEqual([
      'cli',
    ])
  },
)

it('records that trusted config can write directly to stdout', async () => {
  const cli = await startCli({
    project: true,
    config: 'console.log("config direct output")\nexport default { port: 0 }\n',
  })
  handles.push(cli)
  await expect(cli.waitForExit()).rejects.toThrow(
    'Malformed CLI stdout: config direct output',
  )
  await cli.assertResourcesStopped()
  expect(cli.stdout).toContain('config direct output\n')
  expect(() => readJsonEvents(cli.stdout)).toThrow()
  expect((await cli.readJournal()).map((record) => record.role)).toEqual([
    'cli',
  ])
})
