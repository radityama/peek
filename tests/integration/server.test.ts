import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import {
  inspectChildListeners,
  PortSignals,
  verifySelectedServer,
  waitForServer,
} from '../../src/core/server.js'

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

async function listenThenClose(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing address')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

it('confirms ownership while the tracked process still owns the port', async () => {
  const port = await listen()
  await expect(
    verifySelectedServer(process.pid, port, new AbortController().signal),
  ).resolves.toBeUndefined()
})

it('rejects a reachable port that the tracked process no longer owns', async () => {
  const port = await listen()
  const idle = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  })
  try {
    await new Promise<void>((resolve) => idle.once('spawn', resolve))
    if (idle.pid === undefined) throw new Error('Missing idle pid')
    await expect(
      verifySelectedServer(idle.pid, port, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'SERVER_DETECTION_ERROR' })
  } finally {
    idle.kill('SIGKILL')
  }
})

it('rejects a port that is no longer reachable', async () => {
  const port = await listenThenClose()
  await expect(
    verifySelectedServer(undefined, port, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'SERVER_DETECTION_ERROR' })
})

it('treats an unknown pid as unavailable rather than an empty listener set', async () => {
  await expect(inspectChildListeners(undefined)).resolves.toEqual({
    available: false,
    ports: [],
  })
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
