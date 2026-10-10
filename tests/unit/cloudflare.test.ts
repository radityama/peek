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

it('recognizes a public URL split across output chunks', async () => {
  const fake = fakeChild()
  const provider = new CloudflareProvider('/tmp/cloudflared', () => fake.child)
  const connecting = provider.connect({
    target: new URL('http://127.0.0.1:3000'),
    signal: new AbortController().signal,
  })
  fake.stderr.write('https://rapid-riv')
  await new Promise((resolve) => setTimeout(resolve, 5))
  fake.stderr.write('er.trycloudflare.com\n')
  const connection = await connecting
  expect(connection.url).toBe('https://rapid-river.trycloudflare.com')
  fake.exit(0)
  await provider.disconnect()
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

  async function dispose(
    provider: CloudflareProvider,
    children: ReturnType<typeof fakeChild>[],
    observations: Promise<unknown>[] = [],
  ): Promise<void> {
    for (const fake of children) fake.exit(0)
    await Promise.allSettled(observations)
    await provider.disconnect().catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    for (const fake of children) {
      fake.stdout.destroy()
      fake.stderr.destroy()
    }
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

  it.each(['pending', 'ready'] as const)(
    'rejects a second connect while the first is %s',
    async (phase) => {
      const first = fakeChild()
      const launch = vi.fn(() => first.child)
      const provider = new CloudflareProvider('/tmp/cloudflared', launch)
      const options = {
        target: new URL('http://127.0.0.1:3000'),
        signal: new AbortController().signal,
      }
      const connecting = provider.connect(options)
      const observations: Promise<unknown>[] = [
        connecting.catch(() => undefined),
      ]
      try {
        if (phase === 'ready') {
          first.stderr.write('https://first.trycloudflare.com\n')
          await connecting
        }
        const second = Promise.resolve().then(() => provider.connect(options))
        observations.push(second.catch(() => undefined))
        const rejected = expect(second).rejects.toMatchObject({
          code: 'TUNNEL_CONFIG_ERROR',
        })
        await Promise.resolve()
        first.stderr.write('https://first.trycloudflare.com\n')
        await rejected
        expect(launch).toHaveBeenCalledOnce()
        provider.forceDisconnect()
        expect(first.kill).toHaveBeenCalledWith('SIGKILL')
        first.exit(0)
        await observations[0]
        await provider.disconnect()
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        await dispose(provider, [first], observations)
      }
    },
  )

  it('permits a confirmed replacement and ignores input from old streams', async () => {
    const first = fakeChild()
    const replacement = fakeChild()
    const launch = vi
      .fn()
      .mockReturnValueOnce(first.child)
      .mockReturnValueOnce(replacement.child)
    const diagnostic = vi.fn()
    const provider = new CloudflareProvider(
      '/tmp/cloudflared',
      launch,
      diagnostic,
    )
    const options = {
      target: new URL('http://127.0.0.1:3000'),
      signal: new AbortController().signal,
    }
    const observations: Promise<unknown>[] = []
    try {
      const initial = provider.connect(options)
      observations.push(initial.catch(() => undefined))
      first.stderr.write('https://first.trycloudflare.com\n')
      await initial
      first.exit(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(first.stdout.listenerCount('data')).toBe(0)
      expect(first.stderr.listenerCount('data')).toBe(0)
      const next = provider.connect(options)
      observations.push(next.catch(() => undefined))
      first.stderr.write('config.yaml from an old stream\n')
      replacement.stderr.write('https://second.trycloudflare.com\n')
      expect((await next).url).toBe('https://second.trycloudflare.com')
      expect(diagnostic.mock.calls.flat()).not.toContain(
        'config.yaml from an old stream',
      )
      provider.forceDisconnect()
      expect(first.kill).not.toHaveBeenCalled()
      expect(replacement.kill).toHaveBeenCalledWith('SIGKILL')
      replacement.exit(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(replacement.stdout.listenerCount('data')).toBe(0)
      expect(replacement.stderr.listenerCount('data')).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [first, replacement], observations)
    }
  })

  it('shares disconnect even when the kill hook re-enters teardown', async () => {
    const fake = fakeChild()
    const provider = await connected(fake)
    try {
      let entered = false
      let nested: Promise<void> | undefined
      fake.kill.mockImplementation(() => {
        if (!entered) {
          entered = true
          nested = provider.disconnect()
        }
        fake.exit(0)
      })
      const outer = provider.disconnect()
      const simultaneous = provider.disconnect()
      await outer
      expect(simultaneous).toBe(outer)
      expect(nested).toBe(outer)
      expect(fake.kill.mock.calls).toEqual([['SIGTERM']])
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [fake])
    }
  })

  it('keeps connect blocked until confirmed teardown finishes', async () => {
    const fake = fakeChild()
    const provider = await connected(fake)
    const stopping = provider.disconnect()
    const observations: Promise<unknown>[] = [stopping.catch(() => undefined)]
    try {
      await vi.advanceTimersByTimeAsync(0)
      fake.exit(0)
      await fake.child.exit
      expect(() => {
        const connecting = provider.connect({
          target: new URL('http://127.0.0.1:3000'),
          signal: new AbortController().signal,
        })
        observations.push(connecting.catch(() => undefined))
        return connecting
      }).toThrow('already owns')
      await stopping
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [fake], observations)
    }
  })

  it('can retry a failed disconnect while retaining its force handle', async () => {
    const fake = fakeChild()
    const provider = await connected(fake)
    try {
      const failed = expect(provider.disconnect()).rejects.toMatchObject({
        code: 'PROCESS_CLEANUP_ERROR',
      })
      await vi.advanceTimersByTimeAsync(4000)
      await failed
      fake.kill.mockImplementation((signal) => {
        if (signal === 'SIGTERM') fake.exit(0)
      })
      await expect(provider.disconnect()).resolves.toBeUndefined()
      expect(fake.kill.mock.calls.map(([signal]) => signal)).toEqual([
        'SIGTERM',
        'SIGKILL',
        'SIGTERM',
      ])
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [fake])
    }
  })

  it.each(['abort', 'timeout'] as const)(
    'retains startup ownership after %s and ignores a late URL',
    async (reason) => {
      const fake = fakeChild()
      const launch = vi.fn(() => fake.child)
      const controller = new AbortController()
      const provider = new CloudflareProvider('/tmp/cloudflared', launch)
      const connecting = provider.connect({
        target: new URL('http://127.0.0.1:3000'),
        signal: controller.signal,
      })
      const observations: Promise<unknown>[] = [
        connecting.catch(() => undefined),
      ]
      try {
        const rejected = expect(connecting).rejects.toThrow()
        if (reason === 'abort') controller.abort(new Error('cancelled'))
        else await vi.advanceTimersByTimeAsync(45000)
        await rejected
        fake.stderr.write('https://late.trycloudflare.com\n')
        const next = Promise.resolve().then(() =>
          provider.connect({
            target: new URL('http://127.0.0.1:3000'),
            signal: new AbortController().signal,
          }),
        )
        observations.push(next.catch(() => undefined))
        const overlap = expect(next).rejects.toMatchObject({
          code: 'TUNNEL_CONFIG_ERROR',
        })
        await Promise.resolve()
        fake.stderr.write('https://late.trycloudflare.com\n')
        await overlap
        expect(launch).toHaveBeenCalledOnce()
        provider.forceDisconnect()
        expect(fake.kill).toHaveBeenLastCalledWith('SIGKILL')
        fake.exit(0)
        await vi.advanceTimersByTimeAsync(0)
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        await dispose(provider, [fake], observations)
      }
    },
  )

  it.each(['abort', 'timeout'] as const)(
    'rejects a synchronous URL from the kill hook after startup %s',
    async (reason) => {
      const fake = fakeChild()
      const controller = new AbortController()
      const cancelled = new Error('cancelled')
      const provider = new CloudflareProvider(
        '/tmp/cloudflared',
        () => fake.child,
      )
      fake.kill.mockImplementation((signal) => {
        if (signal !== 'SIGTERM') return
        fake.stdout.write('https://late.trycloudflare.com\n')
        fake.stderr.write('https://late.trycloudflare.com\n')
      })
      const connecting = provider.connect({
        target: new URL('http://127.0.0.1:3000'),
        signal: controller.signal,
      })
      const observed = connecting.catch(() => undefined)
      try {
        const rejected =
          reason === 'abort'
            ? expect(connecting).rejects.toBe(cancelled)
            : expect(connecting).rejects.toMatchObject({
                code: 'TUNNEL_CONNECTION_ERROR',
                message:
                  'Cloudflare did not provide a public URL within 45 seconds.',
              })
        void rejected.catch(() => undefined)
        if (reason === 'abort') controller.abort(cancelled)
        else await vi.advanceTimersByTimeAsync(45000)
        await rejected
        expect(fake.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
        expect(vi.getTimerCount()).toBe(0)
        controller.abort(cancelled)
        expect(fake.kill).toHaveBeenCalledTimes(1)
        provider.forceDisconnect()
        expect(fake.kill).toHaveBeenLastCalledWith('SIGKILL')
        fake.exit(0)
        await fake.child.exit
        expect(fake.stdout.listenerCount('data')).toBe(0)
        expect(fake.stderr.listenerCount('data')).toBe(0)
      } finally {
        await dispose(provider, [fake], [observed])
      }
    },
  )

  it('removes data listeners on rejected exit without discarding the child', async () => {
    const fake = fakeChild()
    const provider = await connected(fake)
    try {
      fake.rejectExit(new Error('exit observation failed'))
      await vi.advanceTimersByTimeAsync(0)
      expect(fake.stdout.listenerCount('data')).toBe(0)
      expect(fake.stderr.listenerCount('data')).toBe(0)
      provider.forceDisconnect()
      expect(fake.kill).toHaveBeenLastCalledWith('SIGKILL')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [fake])
    }
  })

  it('handles cancellation that occurs inside the launch boundary', async () => {
    const fake = fakeChild()
    const controller = new AbortController()
    const reason = new Error('cancelled during launch')
    const provider = new CloudflareProvider('/tmp/cloudflared', () => {
      controller.abort(reason)
      return fake.child
    })
    const connecting = provider.connect({
      target: new URL('http://127.0.0.1:3000'),
      signal: controller.signal,
    })
    const observed = connecting.catch(() => undefined)
    try {
      const rejected = expect(connecting).rejects.toBe(reason)
      fake.stderr.write('https://late.trycloudflare.com\n')
      await rejected
      expect(fake.kill).toHaveBeenCalledWith('SIGTERM')
      fake.exit(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [fake], [observed])
    }
  })

  it('rejects connect re-entry from the synchronous launcher', async () => {
    const first = fakeChild()
    const nested = fakeChild()
    const options = {
      target: new URL('http://127.0.0.1:3000'),
      signal: new AbortController().signal,
    }
    const observations: Promise<unknown>[] = []
    let entered = false
    let nestedError: unknown
    const launch = vi.fn(() => {
      if (entered) return nested.child
      entered = true
      try {
        const connecting = provider.connect(options)
        observations.push(connecting.catch(() => undefined))
      } catch (error) {
        nestedError = error
      }
      return first.child
    })
    const provider = new CloudflareProvider('/tmp/cloudflared', launch)
    try {
      const connecting = provider.connect(options)
      observations.push(connecting.catch(() => undefined))
      nested.stderr.write('https://nested.trycloudflare.com\n')
      first.stderr.write('https://first.trycloudflare.com\n')
      expect((await connecting).url).toBe('https://first.trycloudflare.com')
      expect(nestedError).toMatchObject({ code: 'TUNNEL_CONFIG_ERROR' })
      expect(launch).toHaveBeenCalledOnce()
      provider.forceDisconnect()
      expect(first.kill).toHaveBeenCalledWith('SIGKILL')
      expect(nested.kill).not.toHaveBeenCalled()
      first.exit(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [first, nested], observations)
    }
  })

  it('allows a new launch after a synchronous launch failure', async () => {
    const fake = fakeChild()
    const launch = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('spawn failed')
      })
      .mockImplementationOnce(() => fake.child)
    const provider = new CloudflareProvider('/tmp/cloudflared', launch)
    const options = {
      target: new URL('http://127.0.0.1:3000'),
      signal: new AbortController().signal,
    }
    const observations: Promise<unknown>[] = []
    try {
      expect(() => provider.connect(options)).toThrow('spawn failed')
      const connecting = provider.connect(options)
      observations.push(connecting.catch(() => undefined))
      fake.stderr.write('https://next.trycloudflare.com\n')
      await connecting
      fake.exit(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(launch).toHaveBeenCalledTimes(2)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await dispose(provider, [fake], observations)
    }
  })
})
