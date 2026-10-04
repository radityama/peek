import { expect, it, vi } from 'vitest'
import { type CliDependencies, runCli } from '../../src/cli-command.js'
import { type RunOptions, runPeek } from '../../src/core/run.js'
import type { TunnelProvider } from '../../src/tunnel/types.js'
import { PeekError } from '../../src/utils/errors.js'

vi.mock(import('../../src/core/run.js'), () => ({ runPeek: vi.fn() }))

interface CapturedCli {
  stdout: string
  stderr: string
  exitCode: typeof process.exitCode
}

async function captureCli(
  provider: TunnelProvider,
  rawArgs: string[] = ['--json', '--', process.execPath, '-e', ''],
  doctor?: CliDependencies['doctor'],
): Promise<CapturedCli> {
  let stdout = ''
  let stderr = ''
  const previousExitCode = process.exitCode
  const writeOut = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk) => {
      stdout += String(chunk)
      return true
    })
  const writeError = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk) => {
      stderr += String(chunk)
      return true
    })
  process.exitCode = undefined
  try {
    await runCli(rawArgs, {
      prepareProvider: async () => provider,
      ...(doctor ? { doctor } : {}),
    })
    return { stdout, stderr, exitCode: process.exitCode }
  } finally {
    writeOut.mockRestore()
    writeError.mockRestore()
    process.exitCode = previousExitCode
    vi.mocked(runPeek).mockReset()
  }
}

function providerWithCleanup(error?: Error): TunnelProvider {
  return {
    name: 'fixture',
    connect: vi.fn(),
    disconnect: vi.fn(async () => {
      if (error) throw error
    }),
  }
}

function errors(result: CapturedCli): { type: string; message: string }[] {
  const events = result.stdout
    .trim()
    .split('\n')
    .map((line: string) => JSON.parse(line))
  expect(events.every((event) => event.schemaVersion === 1)).toBe(true)
  return events.filter((event) => event.type === 'error')
}

async function requestedCompletion(options: RunOptions): Promise<void> {
  options.lifecycle.requestStop()
  const cleanup = await options.lifecycle.stop()
  if (cleanup.error) throw cleanup.error
}

it('keeps successful requested core completion at exit zero', async () => {
  vi.mocked(runPeek).mockImplementation(requestedCompletion)
  const provider = providerWithCleanup()
  const result = await captureCli(provider)
  expect(result.exitCode ?? 0).toBe(0)
  expect(errors(result)).toEqual([])
  expect(result.stderr).toBe('')
  expect(provider.disconnect).toHaveBeenCalledOnce()
})

it('renders a cleanup failure once after requested core completion', async () => {
  vi.mocked(runPeek).mockImplementation(requestedCompletion)
  const result = await captureCli(
    providerWithCleanup(new Error('cleanup failed')),
  )
  expect(result.exitCode).toBe(1)
  expect(errors(result)).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('Tunnel cleanup failed'),
    }),
  ])
  expect(result.stderr).toBe('')
})

it('renders the primary failure before a distinct cleanup failure', async () => {
  const primary = new PeekError(
    'SERVER_START_ERROR',
    'dev startup failed',
    'Fix the dev startup command.',
  )
  vi.mocked(runPeek).mockImplementation(async ({ lifecycle }) => {
    await lifecycle.stop({ kind: 'failed', error: primary })
    throw primary
  })
  const result = await captureCli(
    providerWithCleanup(new Error('cleanup failed')),
  )
  expect(result.exitCode).toBe(1)
  expect(errors(result)).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('dev startup failed'),
    }),
    expect.objectContaining({
      message: expect.stringContaining('Tunnel cleanup failed'),
    }),
  ])
  expect(result.stderr).toBe('')
})

it('preserves the first signal status while rendering cleanup failure', async () => {
  vi.mocked(runPeek).mockImplementation(async ({ lifecycle }) => {
    lifecycle.requestStop(143)
    lifecycle.requestStop(130)
    const cleanup = await lifecycle.stop()
    if (cleanup.error) throw cleanup.error
  })
  const result = await captureCli(
    providerWithCleanup(new Error('cleanup failed')),
  )
  expect(result.exitCode).toBe(143)
  expect(errors(result)).toHaveLength(1)
  expect(result.stderr).toBe('')
})

it('preserves independent failures during requested shutdown', async () => {
  const primary = new PeekError(
    'SERVER_START_ERROR',
    'independent dev failure',
    'Fix the development server.',
  )
  vi.mocked(runPeek).mockImplementation(async ({ lifecycle }) => {
    lifecycle.requestStop()
    await lifecycle.stop()
    throw primary
  })
  const result = await captureCli(providerWithCleanup())
  expect(result.exitCode).toBe(1)
  expect(errors(result)).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('independent dev failure'),
    }),
  ])
  expect(result.stderr).toBe('')
})

it('suppresses the lifecycle abort reason after a direct stop', async () => {
  vi.mocked(runPeek).mockImplementation(async ({ lifecycle }) => {
    await lifecycle.stop()
    throw lifecycle.signal.reason
  })
  const result = await captureCli(providerWithCleanup())
  expect(result.exitCode ?? 0).toBe(0)
  expect(errors(result)).toEqual([])
  expect(result.stderr).toBe('')
})

it('contains final cleanup failure after successful core completion', async () => {
  vi.mocked(runPeek).mockResolvedValue(undefined)
  const result = await captureCli(
    providerWithCleanup(new Error('final cleanup failed')),
  )
  expect(result.exitCode).toBe(1)
  expect(errors(result)).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('Tunnel cleanup failed'),
    }),
  ])
  expect(result.stderr).toBe('')
})

it('retains failed live-doctor checks after successful requested preview stop', async () => {
  vi.mocked(runPeek).mockImplementation(requestedCompletion)
  const provider = providerWithCleanup()
  const result = await captureCli(
    provider,
    ['doctor', '--live', '--json'],
    async () => [
      {
        name: 'command',
        status: 'fail',
        message: 'Selected command is unavailable.',
        remedy: 'Install the command.',
      },
    ],
  )
  expect(result.exitCode).toBe(1)
  expect(errors(result)).toEqual([])
  expect(result.stderr).toBe('')
  expect(provider.disconnect).toHaveBeenCalledOnce()
})
