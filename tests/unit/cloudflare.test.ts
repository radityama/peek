import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CloudflareProvider,
  parseTunnelUrl,
  type TunnelChild,
} from '../../src/tunnel/cloudflare.js'

describe('Cloudflare URL parsing', () => {
  it('extracts a Quick Tunnel URL from decorated output', () => {
    expect(parseTunnelUrl('| https://blue-green.trycloudflare.com |')).toBe(
      'https://blue-green.trycloudflare.com',
    )
  })

  it.each([
    'http://blue-green.trycloudflare.com',
    'https://blue-green.trycloudflare.com.evil.test',
    'https://foo.bar.trycloudflare.com',
    'https://blue-green.trycloudflare.com/path',
    'https://blue-green.trycloudflare.com:443',
    'https://localhost:3000',
  ])('rejects %s', (line) => {
    expect(parseTunnelUrl(line)).toBeUndefined()
  })
})

function fakeChild(): {
  child: TunnelChild
  stdout: PassThrough
  stderr: PassThrough
  exit: (code: number) => void
  rejectExit: (error: unknown) => void
  kill: ReturnType<typeof vi.fn>
} {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let resolveExit: (value: { exitCode: number }) => void = () => {}
  let rejectExit: (error: unknown) => void = () => {}
  const exit = new Promise<{ exitCode: number }>((resolve, reject) => {
    resolveExit = resolve
    rejectExit = reject
  })
  const kill = vi.fn()
  return {
    child: { stdout, stderr, exit, kill },
    stdout,
    stderr,
    exit: (code) => resolveExit({ exitCode: code }),
    rejectExit,
    kill,
  }
}

describe('Cloudflare target contract', () => {
  it.each([1, 80, 41235, 65535])(
    'uses the supplied local listener on port %i',
    async (port) => {
      const fake = fakeChild()
      const launch = vi.fn(() => fake.child)
      const provider = new CloudflareProvider('/tmp/cloudflared', launch)
      try {
        const connecting = provider.connect({
          target: new URL(`http://127.0.0.1:${port}/`),
          signal: new AbortController().signal,
        })
        fake.stderr.write('https://rapid-river.trycloudflare.com\n')
        const session = await connecting
        expect(launch).toHaveBeenCalledWith('/tmp/cloudflared', [
          'tunnel',
          '--url',
          `http://127.0.0.1:${port}`,
        ])
        expect(session.url).toBe('https://rapid-river.trycloudflare.com')
        fake.exit(17)
        await expect(session.exited).resolves.toEqual({ exitCode: 17 })
      } finally {
        fake.exit(0)
        await provider.disconnect()
      }
    },
  )

  it.each([
    'https://127.0.0.1:3000/',
    'ftp://127.0.0.1:3000/',
    'http://localhost:3000/',
    'http://0.0.0.0:3000/',
    'http://[::]:3000/',
    'http://[::1]:3000/',
    'http://192.168.1.10:3000/',
    'http://example.com:3000/',
    'http://127.0.0.2:3000/',
    'http://user:secret@127.0.0.1:3000/',
    'http://:secret@127.0.0.1:3000/',
    'http://127.0.0.1:3000/nested',
    'http://127.0.0.1:3000/?token=secret',
    'http://127.0.0.1:3000/#fragment',
    'http://127.0.0.1:0/',
  ])('rejects invalid target %s before spawning', async (text) => {
    const fake = fakeChild()
    const launch = vi.fn(() => fake.child)
    const provider = new CloudflareProvider('/tmp/cloudflared', launch)
    const connecting = Promise.resolve().then(() =>
      provider.connect({
        target: new URL(text),
        signal: new AbortController().signal,
      }),
    )
    const rejected = expect(connecting).rejects.toMatchObject({
      code: 'TUNNEL_CONFIG_ERROR',
      message: 'Tunnel target must be a root HTTP URL on 127.0.0.1.',
    })
    try {
      await Promise.resolve()
      fake.stderr.write('https://rapid-river.trycloudflare.com\n')
      await rejected
      expect(launch).not.toHaveBeenCalled()
    } finally {
      fake.exit(0)
      await provider.disconnect()
    }
  })
})

it('waits for a valid public URL on stderr', async () => {
  const fake = fakeChild()
  const provider = new CloudflareProvider('/tmp/cloudflared', () => fake.child)
  const connecting = provider.connect({
    target: new URL('http://127.0.0.1:3000'),
    signal: new AbortController().signal,
  })
  fake.stderr.write('starting\n')
  await new Promise((resolve) => setTimeout(resolve, 5))
  fake.stderr.write('https://rapid-river.trycloudflare.com\n')
  const connection = await connecting
  expect(connection.url).toBe('https://rapid-river.trycloudflare.com')
  fake.exit(0)
  await expect(connection.exited).resolves.toEqual({ exitCode: 0 })
})

it('passes an explicit localhost Host header to cloudflared', async () => {
  const fake = fakeChild()
  const launch = vi.fn(() => fake.child)
  const provider = new CloudflareProvider(
    '/tmp/cloudflared',
    launch,
    undefined,
    'localhost',
  )
  const connecting = provider.connect({
    target: new URL('http://127.0.0.1:3000'),
    signal: new AbortController().signal,
  })
  fake.stderr.write('https://rapid-river.trycloudflare.com\n')
  await connecting
  expect(launch).toHaveBeenCalledWith('/tmp/cloudflared', [
    'tunnel',
    '--url',
    'http://127.0.0.1:3000',
    '--http-host-header',
    'localhost',
  ])
  fake.exit(0)
  await provider.disconnect()
})

it('reports an early tunnel exit', async () => {
  const fake = fakeChild()
  const provider = new CloudflareProvider('/tmp/cloudflared', () => fake.child)
  const connecting = provider.connect({
    target: new URL('http://127.0.0.1:3000'),
    signal: new AbortController().signal,
  })
  fake.stderr.write('network unreachable\n')
  fake.exit(1)
  await expect(connecting).rejects.toMatchObject({
    code: 'TUNNEL_CONNECTION_ERROR',
  })
})

it('reports a local config conflict as nonrecoverable', async () => {
  const fake = fakeChild()
  const provider = new CloudflareProvider('/tmp/cloudflared', () => fake.child)
  const connecting = provider.connect({
    target: new URL('http://127.0.0.1:3000'),
    signal: new AbortController().signal,
  })
  fake.stderr.write('config.yaml blocks Quick Tunnels\n')
  fake.exit(1)
  await expect(connecting).rejects.toMatchObject({
    code: 'TUNNEL_CONFIG_ERROR',
  })
})

it('stops tunnel startup when cancelled', async () => {
  const fake = fakeChild()
  const controller = new AbortController()
  const provider = new CloudflareProvider('/tmp/cloudflared', () => fake.child)
  const connecting = provider.connect({
    target: new URL('http://127.0.0.1:3000'),
    signal: controller.signal,
  })
  controller.abort()
  await expect(connecting).rejects.toThrow()
  expect(fake.kill).toHaveBeenCalledWith('SIGTERM')
  fake.exit(0)
  await provider.disconnect()
})

describe('Cloudflare shutdown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function connected(fake: ReturnType<typeof fakeChild>) {
    const provider = new CloudflareProvider(
      '/tmp/cloudflared',
      () => fake.child,
    )
    const connection = provider.connect({
      target: new URL('http://127.0.0.1:3000'),
      signal: new AbortController().signal,
    })
    fake.stderr.write('https://rapid-river.trycloudflare.com\n')
    await connection
    return provider
  }

  it('rejects unconfirmed exit after three graceful and one forced second', async () => {
    const fake = fakeChild()
    const provider = await connected(fake)
    const disconnected = expect(provider.disconnect()).rejects.toMatchObject({
      code: 'PROCESS_CLEANUP_ERROR',
    })
    await vi.advanceTimersByTimeAsync(2999)
    expect(fake.kill.mock.calls).toEqual([['SIGTERM']])
    await vi.advanceTimersByTimeAsync(1001)
    await disconnected
    expect(vi.getTimerCount()).toBe(0)
    provider.forceDisconnect()
    expect(fake.kill.mock.calls).toEqual([
      ['SIGTERM'],
      ['SIGKILL'],
      ['SIGKILL'],
    ])
    fake.exit(0)
    await vi.advanceTimersByTimeAsync(0)
    provider.forceDisconnect()
    expect(fake.kill).toHaveBeenCalledTimes(3)
  })

  it.each(['SIGTERM', 'SIGKILL'] as const)(
    'accepts exit confirmed after %s and disposes its deadline',
    async (signal) => {
      const fake = fakeChild()
      const provider = await connected(fake)
      fake.kill.mockImplementation((requested) => {
        if (requested === signal) fake.exit(0)
      })
      const disconnected = provider.disconnect()
      await vi.advanceTimersByTimeAsync(signal === 'SIGTERM' ? 0 : 3000)
      await expect(disconnected).resolves.toBeUndefined()
      expect(fake.kill).toHaveBeenLastCalledWith(signal)
      expect(vi.getTimerCount()).toBe(0)
      const kills = fake.kill.mock.calls.length
      provider.forceDisconnect()
      expect(fake.kill).toHaveBeenCalledTimes(kills)
    },
  )

  it('observes late rejected exit without discarding the unconfirmed child', async () => {
    const fake = fakeChild()
    const provider = await connected(fake)
    const disconnected = expect(provider.disconnect()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(4000)
    await disconnected
    fake.rejectExit(new Error('Late exit observation failed'))
    await vi.advanceTimersByTimeAsync(0)
    provider.forceDisconnect()
    expect(fake.kill).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a replacement child reachable when the prior exit arrives late', async () => {
    const first = fakeChild()
    const replacement = fakeChild()
    const launch = vi
      .fn()
      .mockReturnValueOnce(first.child)
      .mockReturnValueOnce(replacement.child)
    const provider = new CloudflareProvider('/tmp/cloudflared', launch)
    for (const fake of [first, replacement]) {
      const connection = provider.connect({
        target: new URL('http://127.0.0.1:3000'),
        signal: new AbortController().signal,
      })
      fake.stderr.write('https://rapid-river.trycloudflare.com\n')
      await connection
    }
    first.exit(0)
    await vi.advanceTimersByTimeAsync(0)
    provider.forceDisconnect()
    expect(first.kill).not.toHaveBeenCalled()
    expect(replacement.kill).toHaveBeenCalledWith('SIGKILL')
    replacement.exit(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
