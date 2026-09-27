import { createServer } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import { PortSignals, waitForServer } from '../../src/core/server.js'

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

async function listen(): Promise<number> {
  const server = createServer((socket) => socket.end())
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing address')
  return address.port
}

it('selects an output-derived port only when reachable', async () => {
  const port = await listen()
  const signals = new PortSignals()
  signals.addChunk(`Local: http://localhost:${port}\n`)
  const selected = await waitForServer({
    signals,
    baselineOpen: new Set(),
    signal: new AbortController().signal,
    hasExited: () => false,
    inspectPorts: async () => [port],
    commonPorts: [],
    timeoutMs: 1000,
  })
  expect(selected).toBe(port)
})

it('rejects an explicit port occupied before startup', async () => {
  const port = await listen()
  await expect(
    waitForServer({
      explicitPort: port,
      signals: new PortSignals(),
      baselineOpen: new Set([port]),
      signal: new AbortController().signal,
      hasExited: () => false,
      inspectPorts: async () => [],
      commonPorts: [],
      timeoutMs: 1000,
    }),
  ).rejects.toMatchObject({ code: 'SERVER_DETECTION_ERROR' })
})

it('rejects two reachable output candidates', async () => {
  const first = await listen()
  const second = await listen()
  const signals = new PortSignals()
  signals.addChunk(
    `Local: http://localhost:${first}\nLocal: http://localhost:${second}\n`,
  )
  await expect(
    waitForServer({
      signals,
      baselineOpen: new Set(),
      signal: new AbortController().signal,
      hasExited: () => false,
      inspectPorts: async () => [],
      commonPorts: [],
      timeoutMs: 1000,
    }),
  ).rejects.toMatchObject({ code: 'SERVER_DETECTION_ERROR' })
})

it('rejects an announced port when the child owns a different listener', async () => {
  const port = await listen()
  const signals = new PortSignals()
  signals.addChunk(`Local: http://localhost:${port}\n`)
  await expect(
    waitForServer({
      signals,
      baselineOpen: new Set(),
      signal: new AbortController().signal,
      hasExited: () => false,
      inspectPorts: async () => [port + 1],
      commonPorts: [],
      timeoutMs: 1000,
    }),
  ).rejects.toMatchObject({ code: 'SERVER_DETECTION_ERROR' })
})

it('does not accept an arbitrary announced port without ownership evidence', async () => {
  const port = await listen()
  const signals = new PortSignals()
  signals.addChunk(`Local: http://localhost:${port}\n`)
  await expect(
    waitForServer({
      signals,
      baselineOpen: new Set(),
      signal: new AbortController().signal,
      hasExited: () => false,
      inspectPorts: async () => [],
      commonPorts: [],
      timeoutMs: 350,
    }),
  ).rejects.toMatchObject({ code: 'SERVER_TIMEOUT' })
})
