import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
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
  kill: ReturnType<typeof vi.fn>
} {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let resolveExit: (value: { exitCode: number }) => void = () => {}
  const exit = new Promise<{ exitCode: number }>((resolve) => {
    resolveExit = resolve
  })
  const kill = vi.fn()
  return {
    child: { stdout, stderr, exit, kill },
    stdout,
    stderr,
    exit: (code) => resolveExit({ exitCode: code }),
    kill,
  }
}

it('waits for a valid public URL on stderr', async () => {
  const fake = fakeChild()
  const provider = new CloudflareProvider('/tmp/cloudflared', () => fake.child)
  const connecting = provider.connect({
    port: 3000,
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
    port: 3000,
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
    port: 3000,
    signal: new AbortController().signal,
  })
  fake.stderr.write('network unreachable\n')
  fake.exit(1)
  await expect(connecting).rejects.toMatchObject({
    code: 'TUNNEL_CONNECTION_ERROR',
  })
})

it('stops tunnel startup when cancelled', async () => {
  const fake = fakeChild()
  const controller = new AbortController()
  const provider = new CloudflareProvider('/tmp/cloudflared', () => fake.child)
  const connecting = provider.connect({ port: 3000, signal: controller.signal })
  controller.abort()
  await expect(connecting).rejects.toThrow()
  expect(fake.kill).toHaveBeenCalledWith('SIGTERM')
  fake.exit(0)
  await provider.disconnect()
})
