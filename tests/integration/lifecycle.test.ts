import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { Lifecycle } from '../../src/core/lifecycle.js'
import { runPeek } from '../../src/core/run.js'
import {
  CloudflareProvider,
  type TunnelChild,
} from '../../src/tunnel/cloudflare.js'

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
    onDevOutput: () => {},
    onReady: (urls) => {
      ready(urls)
      if (ready.mock.calls.length === 2) resolveTwice()
    },
    onReconnectFailure: retryFailure,
  })
  await twice
  expect(ready).toHaveBeenCalledTimes(2)
  expect(retryFailure).toHaveBeenCalledTimes(1)
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
