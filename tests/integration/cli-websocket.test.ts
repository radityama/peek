import { createHash, randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { createConnection, type Socket } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import { type CliHandle, startCli } from '../helpers/cli.js'

const handles: CliHandle[] = []
const sockets: Socket[] = []
afterEach(async () => {
  try {
    await Promise.all(sockets.splice(0).map(closeSocket))
  } finally {
    await Promise.all(handles.splice(0).map((handle) => handle.dispose()))
  }
})

function websocketAccept(key: string): string {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
}

function maskedText(text: string): Buffer {
  const payload = Buffer.from(text)
  if (payload.length > 125) throw new Error('Fixture frame exceeds 125 bytes')
  const mask = randomBytes(4)
  const masked = Buffer.from(payload)
  for (let i = 0; i < masked.length; i++)
    masked[i] = (masked[i] ?? 0) ^ (mask[i % 4] ?? 0)
  return Buffer.concat([
    Buffer.from([0x81, 0x80 | payload.length]),
    mask,
    masked,
  ])
}

function echoedText(
  socket: Socket,
  url: URL,
  text: string,
  sendWithUpgrade: boolean,
  authorization?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64')
    const frame = maskedText(text)
    const request = Buffer.from(
      `GET /echo-websocket HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n${authorization ? `Authorization: ${authorization}\r\n` : ''}\r\n`,
    )
    let pending = Buffer.alloc(0)
    let upgraded = false
    let settled = false
    let fragmentTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error, message?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(fragmentTimer)
      socket.off('data', consume)
      socket.off('error', onError)
      socket.off('close', onClose)
      socket.off('connect', onConnect)
      if (error) reject(error)
      else resolve(message ?? '')
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void =>
      finish(new Error('WebSocket closed before a complete echoed text frame'))
    const onConnect = (): void => {
      socket.write(sendWithUpgrade ? Buffer.concat([request, frame]) : request)
    }
    const consume = (chunk: Buffer): void => {
      try {
        pending = Buffer.concat([pending, chunk])
        if (pending.length > 8192)
          throw new Error('WebSocket fixture response exceeded read bound')
        if (!upgraded) {
          const end = pending.indexOf('\r\n\r\n')
          if (end < 0) return
          const header = pending.subarray(0, end).toString('latin1')
          expect(header.split('\r\n')[0]).toBe(
            'HTTP/1.1 101 Switching Protocols',
          )
          const headers = new Map(
            header
              .split('\r\n')
              .slice(1)
              .map((line) => {
                const colon = line.indexOf(':')
                return [
                  line.slice(0, colon).toLowerCase(),
                  line.slice(colon + 1).trim(),
                ] as const
              }),
          )
          expect(headers.get('upgrade')?.toLowerCase()).toBe('websocket')
          expect(headers.get('connection')?.toLowerCase()).toContain('upgrade')
          expect(headers.get('sec-websocket-accept')).toBe(websocketAccept(key))
          pending = pending.subarray(end + 4)
          upgraded = true
          if (!sendWithUpgrade) {
            // Split the mask and payload across writes to exercise real partial frame arrival.
            socket.write(frame.subarray(0, 3))
            fragmentTimer = setTimeout(
              () => socket.write(frame.subarray(3)),
              20,
            )
          }
        }
        if (pending.length < 2) return
        expect(pending[0]).toBe(0x81)
        const length = pending[1] ?? 0
        expect(length & 0x80).toBe(0)
        expect(length).toBeLessThanOrEqual(125)
        if (pending.length < 2 + length) return
        finish(undefined, pending.subarray(2, 2 + length).toString('utf8'))
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    }
    const timeout = setTimeout(() => {
      finish(new Error('Timed out waiting for a complete WebSocket echo'))
      socket.destroy()
    }, 3000)
    socket.on('data', consume)
    socket.once('error', onError)
    socket.once('close', onClose)
    socket.once('connect', onConnect)
  })
}

function closeSocket(socket: Socket): Promise<void> {
  if (socket.closed) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('WebSocket client did not close')),
      1000,
    )
    socket.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
    socket.destroy()
  })
}

it.each([
  ['a frame sent with the HTTP upgrade', true],
  ['a frame fragmented after the HTTP upgrade', false],
] as const)(
  'echoes %s through the real transport',
  async (_description, sendWithUpgrade) => {
    const cli = await startCli({ env: { PEEK_TEST_WS_FRAGMENT: '1' } })
    handles.push(cli)
    const ready = await cli.waitForEvent('ready')
    const url = new URL(String(ready.publicUrl))
    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port),
    })
    sockets.push(socket)
    socket.on('error', () => {})
    const message = 'peek WebSocket echo π'
    expect(await echoedText(socket, url, message, sendWithUpgrade)).toBe(
      message,
    )
    await closeSocket(socket)
    await cli.signal('SIGTERM')
    expect((await cli.waitForExit()).code).toBe(143)
    await cli.assertResourcesStopped()
  },
)

it('authenticates WebSocket upgrades through the protected proxy', async () => {
  const cli = await startCli({
    args: ['--json', '--password'],
    env: { PEEK_TEST_PASSWORD: 'socket preview secret' },
  })
  handles.push(cli)
  const ready = await cli.waitForEvent('ready')
  const url = new URL(String(ready.publicUrl))
  const unauthenticated = await new Promise<number>((resolve, reject) => {
    const request = httpRequest(url, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': randomBytes(16).toString('base64'),
      },
    })
    request.on('response', (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    request.on('upgrade', () =>
      reject(new Error('Unauthorized upgrade succeeded')),
    )
    request.on('error', reject)
    request.end()
  })
  expect(unauthenticated).toBe(401)
  const socket = createConnection({
    host: url.hostname,
    port: Number(url.port),
  })
  sockets.push(socket)
  socket.on('error', () => {})
  const authorization = `Basic ${Buffer.from('peek:socket preview secret').toString('base64')}`
  expect(
    await echoedText(socket, url, 'protected HMR', false, authorization),
  ).toBe('protected HMR')
  const closed = new Promise<void>((resolve) =>
    socket.once('close', () => resolve()),
  )
  await cli.signal('SIGTERM')
  expect((await cli.waitForExit()).code).toBe(143)
  await closed
  await cli.assertResourcesStopped()
})
