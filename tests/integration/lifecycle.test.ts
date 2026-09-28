import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { Lifecycle } from '../../src/core/lifecycle.js'
import { runPeek } from '../../src/core/run.js'
import {
  CloudflareProvider,
  type TunnelChild,
} from '../../src/tunnel/cloudflare.js'
import { checkForUpdate } from '../../src/update/check.js'
import { createUpdateNotice } from '../../src/update/notice.js'

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
    onReady: ready,
    onDevOutput: (_stream, text) => {
      const match = /PID: (\d+)/.exec(text)
      if (match?.[1]) devPid = Number(match[1])
    },
  })
  const urls = await readyPromise
  expect(urls.localUrl).toMatch(/^http:\/\/localhost:\d+$/)
  expect(urls.publicUrl).toBe('https://fixture-peek.trycloudflare.com')
  lifecycle.requestStop()
  await expect(running).resolves.toBeUndefined()
  expect(lifecycle.isStopped).toBe(true)
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
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  lifecycle.requestStop()
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
    onLanReady: resolveReady,
  })
  expect(await ready).toMatch(/^http:\/\/192\.168\.1\.4:\d+$/)
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
    onDevOutput: (_stream, text) => {
      const match = /PID: (\d+)/.exec(text)
      if (match?.[1]) devPids.add(Number(match[1]))
    },
    onReady: (urls) => {
      ready(urls)
      if (ready.mock.calls.length === 2) resolveTwice()
    },
    onReconnectFailure: retryFailure,
    onTunnelDrop: tunnelDrop,
  })
  await twice
  expect(ready).toHaveBeenCalledTimes(2)
  expect(devPids.size).toBe(1)
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

function isRunning(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
