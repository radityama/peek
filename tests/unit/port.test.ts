import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { privateLanAddresses } from '../../src/core/lan.js'
import {
  extractLocalPorts,
  parsePort,
  probeHostPort,
  probePort,
} from '../../src/core/port.js'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
})

it('probes a server through a private interface when one is available', async () => {
  const lanAddress = privateLanAddresses()[0]
  if (!lanAddress) return
  const server = createServer((socket) => socket.end())
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing address')
  expect(await probeHostPort(lanAddress, address.port)).toBe(true)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  servers.splice(servers.indexOf(server), 1)
  expect(await probeHostPort(lanAddress, address.port)).toBe(false)
})

describe('port parsing', () => {
  it.each([
    ['- Local: http://localhost:3000', [3000]],
    ['Local: http://127.0.0.1:5173/', [5173]],
    ['Astro http://localhost:4321/', [4321]],
    ['Server listening on port 8080', [8080]],
    ['Listening on :3001', [3001]],
    ['https://example.trycloudflare.com', []],
    ['metrics server on 127.0.0.1:20241/metrics', []],
  ] as const)('extracts from %s', (line, expected) => {
    expect(extractLocalPorts(line)).toEqual(expected)
  })

  it.each([
    ['Next.js', '  - Local:        http://localhost:3000', 3000],
    ['Vite', '  ➜  Local:   http://localhost:5173/', 5173],
    ['Astro', '  Local    http://localhost:4321/', 4321],
    ['Nuxt', '  ➜ Local: http://localhost:3000/', 3000],
    ['TanStack Start', '  Local: http://localhost:3001/', 3001],
  ] as const)('parses a %s startup line', (_framework, line, port) => {
    expect(extractLocalPorts(line)).toEqual([port])
  })

  it('rejects invalid explicit ports', () => {
    expect(parsePort('5173')).toBe(5173)
    for (const input of ['0', '65536', '-1', '3000abc', '1.5']) {
      expect(() => parsePort(input)).toThrow()
    }
  })
})

it('probes a real loopback listener', async () => {
  const server = createServer((socket) => socket.end())
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing address')
  expect(await probePort(address.port)).toBe(true)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  servers.splice(servers.indexOf(server), 1)
  expect(await probePort(address.port)).toBe(false)
})
