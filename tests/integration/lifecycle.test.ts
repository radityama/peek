import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { Lifecycle, type LifecyclePhase } from '../../src/core/lifecycle.js'
import { runPeek } from '../../src/core/run.js'
import { inspectChildListeningPorts } from '../../src/core/server.js'
import {
  CloudflareProvider,
  type TunnelChild,
} from '../../src/tunnel/cloudflare.js'
import type { TunnelProvider } from '../../src/tunnel/types.js'
import { checkForUpdate } from '../../src/update/check.js'
import { createUpdateNotice } from '../../src/update/notice.js'
import { PeekError } from '../../src/utils/errors.js'

const serverFile = fileURLToPath(
  new URL('../fixtures/fake-server/server.mjs', import.meta.url),
)
const tunnelFile = fileURLToPath(
  new URL('../fixtures/fake-tunnel/tunnel.mjs', import.meta.url),
)
const lifecycles: Lifecycle[] = []
const tunnelPids: number[] = []

afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.stop()))
})

function fakeProvider(mode: string | string[] = 'ready'): CloudflareProvider {
  let launches = 0
  return new CloudflareProvider('fake', () => {
    const selected = Array.isArray(mode)
      ? (mode[Math.min(launches, mode.length - 1)] ?? 'ready')
      : mode
    launches++
    const child = execa(process.execPath, [tunnelFile, selected], {
      stdout: 'pipe',
      stderr: 'pipe',
      reject: false,
      killDescendants: true,
      buffer: false,
    })
    if (!child.stdout || !child.stderr)
      throw new Error('Missing tunnel streams')
    if (child.pid) tunnelPids.push(child.pid)
    return {
      stdout: child.stdout,
      stderr: child.stderr,
      exit: child.then((result) => ({ exitCode: result.exitCode ?? null })),
      kill: (signal) => {
        child.kill(signal)
      },
    } satisfies TunnelChild
  })
}

it('starts a fake server and tunnel and cleans both on cancellation', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const provider = fakeProvider()
  const phases: LifecyclePhase[] = []
  let ready: (value: { localUrl: string; publicUrl: string }) => void = () => {}
  const readyPromise = new Promise<{ localUrl: string; publicUrl: string }>(
    (resolve) => {
      ready = resolve
    },
  )
  let devPid: number | undefined
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider,
    onState: () => phases.push(lifecycle.phase),
    onServerReady: () => phases.push(lifecycle.phase),
    onReady: (urls) => {
      phases.push(lifecycle.phase)
      ready(urls)
    },
    onDevOutput: (_stream, text) => {
      const match = /PID: (\d+)/.exec(text)
      if (match?.[1]) devPid = Number(match[1])
    },
  })
  const urls = await readyPromise
  expect(urls.localUrl).toMatch(/^http:\/\/localhost:\d+$/)
  expect(urls.publicUrl).toBe('https://fixture-peek.trycloudflare.com')
  expect(phases).toEqual([
    'starting-server',
    'discovering-server',
    'server-ready',
    'tunnel-connecting',
    'ready',
  ])
  lifecycle.requestStop()
  await expect(running).resolves.toBeUndefined()
  expect(lifecycle.isStopped).toBe(true)
  expect(lifecycle.phase).toBe('stopped')
  expect(lifecycle.outcome?.kind).toBe('requested')
  expect(devPid).toBeTypeOf('number')
  expect(isRunning(devPid ?? 0)).toBe(false)
  expect(isRunning(tunnelPids.at(-1) ?? 0)).toBe(false)
})

it('reaches preview readiness while the registry request remains pending', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peek-update-startup-'))
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const show = vi.fn()
  const notice = createUpdateNotice(show)
  let completeRequest: (version: string) => void = () => {}
  let markRequestStarted: () => void = () => {}
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve
  })
  const checking = checkForUpdate({
    currentVersion: '0.2.0',
    cachePath: join(directory, 'update-check.json'),
    signal: lifecycle.signal,
    // Keep this request pending through slower Windows preview startup.
    timeoutMs: 10_000,
    requestLatest: () => {
      markRequestStarted()
      return new Promise<string>((resolve) => {
        completeRequest = resolve
      })
    },
  })
  void checking.then((update) => notice.receive(update))
  let markReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider(),
    onReady: () => {
      notice.ready()
      markReady()
    },
  })
  try {
    await Promise.all([requestStarted, ready])
    expect(show).not.toHaveBeenCalled()
    completeRequest('0.2.1')
    await checking
    expect(show).toHaveBeenCalledOnce()
    expect(show).toHaveBeenCalledWith({ current: '0.2.0', latest: '0.2.1' })
  } finally {
    notice.stop()
    lifecycle.requestStop()
    await running
    await rm(directory, { recursive: true, force: true })
  }
})

it('holds an update result until the preview URL is ready', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peek-update-before-ready-'))
  const update = await checkForUpdate({
    currentVersion: '0.2.0',
    cachePath: join(directory, 'update-check.json'),
    requestLatest: async () => '0.2.1',
  })
  const show = vi.fn()
  const notice = createUpdateNotice(show)
  notice.receive(update)
  expect(show).not.toHaveBeenCalled()

  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  let markReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider(),
    onReady: () => {
      notice.ready()
      markReady()
    },
  })
  try {
    await ready
    expect(show).toHaveBeenCalledOnce()
    expect(show).toHaveBeenCalledWith({ current: '0.2.0', latest: '0.2.1' })
  } finally {
    notice.stop()
    lifecycle.requestStop()
    await running
    await rm(directory, { recursive: true, force: true })
  }
})

it('does not connect a tunnel when the dev server crashes', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const provider = fakeProvider()
  const connect = vi.spyOn(provider, 'connect')
  await expect(
    runPeek({
      cwd: process.cwd(),
      command: { file: process.execPath, args: [serverFile, 'crash'] },
      lifecycle,
      provider,
      onDevOutput: () => {},
    }),
  ).rejects.toMatchObject({
    code: 'SERVER_START_ERROR',
    message: 'Development server exited with code 1 before becoming ready.',
  })
  expect(connect).not.toHaveBeenCalled()
  expect(lifecycle.isStopped).toBe(true)
})

it('identifies an unavailable dev command', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  await expect(
    runPeek({
      cwd: process.cwd(),
      command: { file: 'peek-command-that-does-not-exist', args: [] },
      lifecycle,
      provider: fakeProvider(),
      onDevOutput: () => {},
    }),
  ).rejects.toMatchObject({ code: 'PACKAGE_MANAGER_ERROR' })
})

it('stops a hung server during readiness', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile, 'hang'] },
    lifecycle,
    provider: fakeProvider(),
    onDevOutput: () => {},
    onState: (state) => {
      if (state === 'waiting') lifecycle.requestStop()
    },
  })
  await expect(running).resolves.toBeUndefined()
  expect(lifecycle.isStopped).toBe(true)
})

it('stops a descendant process with the dev server', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  let childPid: number | undefined
  let resolveReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile, 'tree'] },
    lifecycle,
    provider: fakeProvider(),
    onDevOutput: (_stream, text) => {
      const match = /CHILD PID: (\d+)/.exec(text)
      if (match?.[1]) childPid = Number(match[1])
    },
    onReady: () => resolveReady(),
  })
  await ready
  expect(childPid).toBeTypeOf('number')
  lifecycle.requestStop()
  await running
  expect(isRunning(childPid ?? 0)).toBe(false)
})

it('keeps a LAN preview without starting a tunnel', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const phases: LifecyclePhase[] = []
  let resolveReady: (url: string) => void = () => {}
  const ready = new Promise<string>((resolve) => {
    resolveReady = resolve
  })
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    lan: true,
    lanAddressSelector: async () => '192.168.1.4',
    onState: () => phases.push(lifecycle.phase),
    onServerReady: () => phases.push(lifecycle.phase),
    onLanReady: (url) => {
      phases.push(lifecycle.phase)
      resolveReady(url)
    },
  })
  expect(await ready).toMatch(/^http:\/\/192\.168\.1\.4:\d+$/)
  expect(phases).toEqual([
    'starting-server',
    'discovering-server',
    'server-ready',
    'ready',
  ])
  lifecycle.requestStop()
  await expect(running).resolves.toBeUndefined()
  expect(lifecycle.isStopped).toBe(true)
})

it('completes live preview checks and cleans up', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const findings: string[] = []
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider(),
    framework: 'vite',
    previewCheck: async () => [
      { kind: 'hmr-failed', message: 'WebSocket upgrade failed' },
    ],
    onPreviewFinding: (finding) => findings.push(finding.kind),
    onPreviewCheckComplete: () => lifecycle.requestStop(),
  })
  await expect(running).resolves.toBeUndefined()
  expect(findings).toEqual(['hmr-failed'])
  expect(lifecycle.isStopped).toBe(true)
})

it('reconnects a dropped tunnel without restarting the dev server', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const ready = vi.fn()
  const retryFailure = vi.fn()
  const tunnelDrop = vi.fn()
  const devPids = new Set<number>()
  const phases: LifecyclePhase[] = []
  let resolveTwice: () => void = () => {}
  const twice = new Promise<void>((resolve) => {
    resolveTwice = resolve
  })
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider(['later-crash', 'crash', 'ready']),
    retryDelaysMs: [1],
    onState: () => phases.push(lifecycle.phase),
    onDevOutput: (_stream, text) => {
      const match = /PID: (\d+)/.exec(text)
      if (match?.[1]) devPids.add(Number(match[1]))
    },
    onReady: (urls) => {
      phases.push(lifecycle.phase)
      ready(urls)
      if (ready.mock.calls.length === 2) resolveTwice()
    },
    onReconnectFailure: retryFailure,
    onTunnelDrop: tunnelDrop,
  })
  await twice
  expect(ready).toHaveBeenCalledTimes(2)
  expect(devPids.size).toBe(1)
  expect(phases).toEqual([
    'starting-server',
    'discovering-server',
    'tunnel-connecting',
    'ready',
    'reconnecting',
    'ready',
  ])
  expect(retryFailure).toHaveBeenCalledTimes(1)
  expect(tunnelDrop).toHaveBeenCalledWith('Tunnel exited with code 1.')
  expect(lifecycle.isStopped).toBe(false)
  lifecycle.requestStop()
  await expect(running).resolves.toBeUndefined()
  expect(lifecycle.isStopped).toBe(true)
})

it('retries an initial tunnel failure while keeping the dev server alive', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const retryFailure = vi.fn()
  let resolveReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider(['crash', 'ready']),
    retryDelaysMs: [1],
    onDevOutput: () => {},
    onReady: resolveReady,
    onReconnectFailure: retryFailure,
  })
  await ready
  expect(retryFailure).toHaveBeenCalledTimes(1)
  expect(lifecycle.isStopped).toBe(false)
  lifecycle.requestStop()
  await expect(running).resolves.toBeUndefined()
})

it('stops from the starting callback before spawning a dev process', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const output: string[] = []
  const setDev = vi.spyOn(lifecycle, 'setDev')
  await runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider(),
    onState: (state) => {
      if (state === 'starting') lifecycle.requestStop()
    },
    onDevOutput: (_stream, text) => output.push(text),
  })
  expect(output).toEqual([])
  expect(setDev).not.toHaveBeenCalled()
  expect(lifecycle.phase).toBe('stopped')
  expect(lifecycle.outcome?.kind).toBe('requested')
})

it('retains the dev startup failure when provider cleanup rejects', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const cleanupError = new Error('provider disconnect failed')
  const disconnect = vi.fn(async () => {
    throw cleanupError
  })
  const setDev = vi.spyOn(lifecycle, 'setDev')
  const connect = vi.fn()
  const error = await runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile, 'crash'] },
    lifecycle,
    provider: { name: 'fixture', connect, disconnect },
  }).catch((failure: unknown) => failure)
  expect(error).toMatchObject({ code: 'SERVER_START_ERROR' })
  expect(lifecycle.phase).toBe('stopped')
  expect(lifecycle.outcome).toEqual({ kind: 'failed', error })
  if (lifecycle.outcome?.kind === 'failed') {
    expect(lifecycle.outcome.error).toBe(error)
  }
  const cleanup = await lifecycle.stop()
  expect(cleanup.error).toMatchObject({ code: 'PROCESS_CLEANUP_ERROR' })
  expect(cleanup.error?.message).toContain('tunnel')
  expect(disconnect).toHaveBeenCalledOnce()
  expect(connect).not.toHaveBeenCalled()
  const dev = setDev.mock.calls[0]?.[0]
  expect(dev).toBeDefined()
  expect(isRunning(dev?.pid ?? 0)).toBe(false)
  expect(await inspectChildListeningPorts(dev?.pid)).toEqual([])
})

it('closes a verified dev listener despite primary and cleanup failures', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const primary = new PeekError(
    'SERVER_START_ERROR',
    'startup failed after port verification',
    'Fix the startup callback.',
  )
  const setDev = vi.spyOn(lifecycle, 'setDev')
  let port: number | undefined
  await expect(
    runPeek({
      cwd: process.cwd(),
      command: { file: process.execPath, args: [serverFile] },
      lifecycle,
      provider: {
        name: 'fixture',
        connect: vi.fn(),
        disconnect: async () => {
          throw new Error('provider cleanup failed')
        },
      },
      onServerReady: (value) => {
        port = value
        throw primary
      },
    }),
  ).rejects.toBe(primary)
  expect(port).toBeTypeOf('number')
  expect(lifecycle.outcome).toEqual({ kind: 'failed', error: primary })
  expect((await lifecycle.stop()).error).toMatchObject({
    code: 'PROCESS_CLEANUP_ERROR',
  })
  const dev = setDev.mock.calls[0]?.[0]
  expect(dev?.pid).toBeTypeOf('number')
  expect(isRunning(dev?.pid ?? 0)).toBe(false)
  expect(await inspectChildListeningPorts(dev?.pid)).toEqual([])
})

it('rejects cleanup failure after an otherwise successful requested stop', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const setDev = vi.spyOn(lifecycle, 'setDev')
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: {
      name: 'fixture',
      connect: vi.fn(),
      disconnect: async () => {
        throw new Error('provider cleanup failed')
      },
    },
    onState: (state) => {
      if (state === 'starting') lifecycle.requestStop()
    },
  })
  const cleanup = await running.catch((error: unknown) => error)
  expect(cleanup).toMatchObject({ code: 'PROCESS_CLEANUP_ERROR' })
  expect((await lifecycle.stop()).error).toBe(cleanup)
  expect(setDev).not.toHaveBeenCalled()
  expect(lifecycle.outcome?.kind).toBe('requested')
})

it('does not publish a LAN address selected after a direct stop', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const selected = deferred<string>()
  const selecting = deferred<void>()
  const ready = vi.fn()
  let port: number | undefined
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    lan: true,
    onServerReady: (value) => {
      port = value
    },
    lanAddressSelector: () => {
      selecting.resolve()
      return selected.promise
    },
    onLanReady: ready,
  })
  await selecting.promise
  await lifecycle.stop()
  selected.resolve('192.168.1.4')
  await expect(running).resolves.toBeUndefined()
  expect(ready).not.toHaveBeenCalled()
  expect(lifecycle.phase).toBe('stopped')
  expect(lifecycle.outcome?.kind).toBe('completed')
  expect(port).toBeTypeOf('number')
})

it('does not publish a connection resolved during cancellation', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const connecting = deferred<void>()
  const connected = deferred<{
    url: string
    exited: Promise<{ exitCode: number | null }>
  }>()
  const ready = vi.fn()
  const preview = vi.fn(async () => [])
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: {
      name: 'fixture',
      connect: ({ signal }) => {
        signal.addEventListener(
          'abort',
          () => {
            connected.resolve({
              url: 'https://late.trycloudflare.com',
              exited: new Promise(() => {}),
            })
          },
          { once: true },
        )
        connecting.resolve()
        return connected.promise
      },
      disconnect: async () => {},
    },
    framework: 'vite',
    previewCheck: preview,
    onReady: ready,
  })
  await connecting.promise
  lifecycle.requestStop()
  await expect(running).resolves.toBeUndefined()
  expect(ready).not.toHaveBeenCalled()
  expect(preview).not.toHaveBeenCalled()
  expect(lifecycle.phase).toBe('stopped')
})

it('does not start preview checks when the ready callback stops Peek', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const preview = vi.fn(async () => [])
  await runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider(),
    framework: 'vite',
    previewCheck: preview,
    onReady: () => lifecycle.requestStop(),
  })
  expect(preview).not.toHaveBeenCalled()
  expect(lifecycle.outcome?.kind).toBe('requested')
})

it('preserves an independent failure thrown after a requested stop', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const failure = new PeekError(
    'SERVER_START_ERROR',
    'startup callback failed',
    'Restart after fixing the startup callback.',
  )
  await expect(
    runPeek({
      cwd: process.cwd(),
      command: { file: process.execPath, args: [serverFile] },
      lifecycle,
      provider: fakeProvider(),
      onState: (state) => {
        if (state !== 'starting') return
        lifecycle.requestStop()
        throw failure
      },
    }),
  ).rejects.toBe(failure)
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}

function isRunning(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

it('exhausts eight initial tunnel failures and cleans the original dev process', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const setDev = vi.spyOn(lifecycle, 'setDev')
  const firstTunnel = tunnelPids.length
  const failures = vi.fn((attempt: number) => {
    if (attempt >= 9) lifecycle.requestStop()
  })
  const ready = vi.fn()
  const error = await runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider('crash'),
    retryDelaysMs: [1],
    onReconnectFailure: failures,
    onReady: ready,
  }).catch((failure: unknown) => failure)
  expect(error).toMatchObject({ code: 'TUNNEL_CONNECTION_ERROR' })
  expect(failures.mock.calls.map(([attempt]) => attempt)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8,
  ])
  expect(ready).not.toHaveBeenCalled()
  expect(tunnelPids.slice(firstTunnel)).toHaveLength(8)
  const dev = setDev.mock.calls[0]?.[0]
  expect(dev).toBeDefined()
  expect(isRunning(dev?.pid ?? 0)).toBe(false)
  expect(tunnelPids.slice(firstTunnel).every((pid) => !isRunning(pid))).toBe(
    true,
  )
  expect(lifecycle.phase).toBe('stopped')
  expect(lifecycle.outcome?.kind).toBe('failed')
})

it('exhausts short tunnel sessions rather than resetting at readiness', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  const setDev = vi.spyOn(lifecycle, 'setDev')
  const firstTunnel = tunnelPids.length
  const ready = vi.fn(() => {
    if (ready.mock.calls.length >= 9) lifecycle.requestStop()
  })
  const dropped = vi.fn()
  const error = await runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider: fakeProvider('later-crash'),
    retryDelaysMs: [1],
    onReady: ready,
    onTunnelDrop: dropped,
  }).catch((failure: unknown) => failure)
  expect(error).toMatchObject({ code: 'TUNNEL_CONNECTION_ERROR' })
  expect(ready).toHaveBeenCalledTimes(8)
  expect(dropped).toHaveBeenCalledTimes(8)
  expect(tunnelPids.slice(firstTunnel)).toHaveLength(8)
  expect(isRunning(setDev.mock.calls[0]?.[0].pid ?? 0)).toBe(false)
  expect(tunnelPids.slice(firstTunnel).every((pid) => !isRunning(pid))).toBe(
    true,
  )
})

it.each([29999, 30000])(
  'applies the stable reset boundary at %i ms without restarting dev',
  async (duration) => {
    const lifecycle = new Lifecycle()
    lifecycles.push(lifecycle)
    const setDev = vi.spyOn(lifecycle, 'setDev')
    const firstTunnel = tunnelPids.length
    const failures = vi.fn()
    let now = 0
    const ready = vi.fn(() => {
      now = duration
      if (ready.mock.calls.length === 2) lifecycle.requestStop()
    })
    const modes = [
      ...Array.from({ length: 7 }, () => 'crash'),
      'later-crash',
      'crash',
      'ready',
    ]
    const error = await runPeek({
      cwd: process.cwd(),
      command: { file: process.execPath, args: [serverFile] },
      lifecycle,
      provider: fakeProvider(modes),
      retryDelaysMs: [1],
      now: () => now,
      onReconnectFailure: failures,
      onReady: ready,
    }).catch((failure: unknown) => failure)
    if (duration === 29999) {
      expect(error).toMatchObject({ code: 'TUNNEL_CONNECTION_ERROR' })
      expect(ready).toHaveBeenCalledOnce()
      expect(failures.mock.calls.map(([attempt]) => attempt)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ])
      expect(tunnelPids.slice(firstTunnel)).toHaveLength(8)
    } else {
      expect(error).toBeUndefined()
      expect(ready).toHaveBeenCalledTimes(2)
      expect(failures.mock.calls.map(([attempt]) => attempt)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ])
      expect(tunnelPids.slice(firstTunnel)).toHaveLength(10)
    }
    expect(setDev).toHaveBeenCalledOnce()
    expect(isRunning(setDev.mock.calls[0]?.[0].pid ?? 0)).toBe(false)
    expect(tunnelPids.slice(firstTunnel).every((pid) => !isRunning(pid))).toBe(
      true,
    )
  },
)

it('passes the verified loopback URL to a generic provider', async () => {
  const lifecycle = new Lifecycle()
  lifecycles.push(lifecycle)
  let target: URL | undefined
  let selectedPort: number | undefined
  let devPid: number | undefined
  let markReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })
  const provider: TunnelProvider = {
    name: 'generic-test',
    connect: async (options) => {
      options.signal.throwIfAborted()
      target = options.target
      return {
        url: 'https://preview.peek.test',
        exited: new Promise<never>(() => {}),
      }
    },
    disconnect: vi.fn(async () => {}),
  }
  const running = runPeek({
    cwd: process.cwd(),
    command: { file: process.execPath, args: [serverFile] },
    lifecycle,
    provider,
    onServerReady: (port) => {
      selectedPort = port
    },
    onReady: markReady,
    onDevOutput: (_stream, text) => {
      const match = /PID: (\d+)/.exec(text)
      if (match?.[1]) devPid = Number(match[1])
    },
  })
  try {
    await Promise.race([
      ready,
      running.then(() => {
        throw new Error('Preview stopped before readiness')
      }),
    ])
    expect(selectedPort).toBeTypeOf('number')
    expect(target).toBeInstanceOf(URL)
    expect(target?.href).toBe(`http://127.0.0.1:${selectedPort}/`)
    const address = target?.href ?? ''
    const response = await fetch(address, { signal: AbortSignal.timeout(3000) })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('peek fixture ready')
    lifecycle.requestStop()
    await expect(running).resolves.toBeUndefined()
    expect(provider.disconnect).toHaveBeenCalled()
    expect(devPid).toBeTypeOf('number')
    expect(isRunning(devPid ?? 0)).toBe(false)
    await expect(
      fetch(address, { signal: AbortSignal.timeout(1000) }),
    ).rejects.toThrow()
  } finally {
    lifecycle.requestStop()
    await running.catch(() => {})
  }
})
