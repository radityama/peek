import { createServer } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import {
  checkPreview,
  classifyHostRejection,
  probeWebSocketUpgrade,
} from '../../src/core/preview-checks.js'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  )
})

it('reports blocked host and a failed public HMR upgrade', async () => {
  const findings = await checkPreview(
    'http://localhost:3000',
    'https://fixture.trycloudflare.com',
    'vite',
    new AbortController().signal,
    {
      fetcher: async () =>
        new Response('Blocked request. This host is not allowed.', {
          status: 403,
        }),
      probeUpgrade: async (url) => url.startsWith('http:'),
    },
  )
  expect(findings.map((finding) => finding.kind)).toEqual([
    'blocked-host',
    'hmr-failed',
  ])
})

it('does not claim HMR failed when the public probe cannot connect', async () => {
  const findings = await checkPreview(
    'http://localhost:3000',
    'https://fixture.trycloudflare.com',
    'vite',
    new AbortController().signal,
    {
      fetcher: async () => new Response('ok'),
      probeUpgrade: async (url) => (url.startsWith('http:') ? true : undefined),
    },
  )
  expect(findings.map((finding) => finding.kind)).toEqual(['hmr-unverified'])
})

it('identifies a Vite blocked-host response without claiming unrelated 403s', () => {
  expect(
    classifyHostRejection(
      403,
      'Blocked request. This host is not allowed.',
      'vite',
      'demo.trycloudflare.com',
    ),
  ).toMatchObject({ kind: 'blocked-host' })
  expect(
    classifyHostRejection(403, 'Forbidden', 'vite', 'demo.trycloudflare.com'),
  ).toBeUndefined()
})

it('checks a real WebSocket upgrade', async () => {
  const server = createServer()
  servers.push(server)
  server.on('upgrade', (_request, socket) => {
    socket.end(
      'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing port')
  expect(
    await probeWebSocketUpgrade(
      `http://127.0.0.1:${address.port}`,
      new AbortController().signal,
    ),
  ).toBe(true)
})
