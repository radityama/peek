import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from 'node:http'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { PeekError } from '../utils/errors.js'
import { createAuthGate, validWebSocketOrigin } from './proxy-auth.js'

export interface PreviewProxy {
  readonly port: number
  close(): Promise<void>
}

export interface ProxyOptions {
  targetPort: number
  verifyTarget: () => Promise<void>
  password?: string
  originHostHeader?: 'localhost'
  publicOrigin?: () => string | undefined
  now?: () => number
}

function headersForOrigin(
  incoming: IncomingMessage,
  options: ProxyOptions,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = { ...incoming.headers }
  removeHopByHop(headers)
  delete headers['proxy-authorization']
  delete headers['proxy-connection']
  if (options.password !== undefined) delete headers.authorization
  if (options.originHostHeader) headers.host = options.originHostHeader
  return headers
}

const hopByHop = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const

function removeHopByHop(headers: OutgoingHttpHeaders): void {
  const connection = headers.connection
  const nominations = Array.isArray(connection)
    ? connection.join(',')
    : String(connection ?? '')
  for (const name of nominations.split(','))
    delete headers[name.trim().toLowerCase()]
  for (const name of hopByHop) delete headers[name]
}

function rejectHttp(response: ServerResponse, status: number): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...(status === 401
      ? { 'www-authenticate': 'Basic realm="Peek preview", charset="UTF-8"' }
      : {}),
    ...(status === 429 ? { 'retry-after': '5' } : {}),
  })
  response.end(
    status === 401
      ? 'Authentication required\n'
      : status === 429
        ? 'Too many authentication attempts\n'
        : 'Preview server unavailable\n',
  )
}

function rejectSocket(socket: Duplex, status: number): void {
  if (socket.destroyed) return
  const reason =
    status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : status === 429
          ? 'Too Many Requests'
          : 'Bad Gateway'
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Cache-Control: no-store\r\n' +
      (status === 401
        ? 'WWW-Authenticate: Basic realm="Peek preview", charset="UTF-8"\r\n'
        : '') +
      (status === 429 ? 'Retry-After: 5\r\n' : '') +
      'Content-Length: 0\r\nConnection: close\r\n\r\n',
  )
}

function responseHead(response: IncomingMessage): string {
  const status = response.statusCode ?? 502
  const lines = [`HTTP/1.1 ${status} ${response.statusMessage ?? ''}`]
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    lines.push(
      `${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}`,
    )
  }
  return `${lines.join('\r\n')}\r\n\r\n`
}

function rejectedUpgradeHead(response: IncomingMessage): string {
  const headers: OutgoingHttpHeaders = { ...response.headers }
  removeHopByHop(headers)
  // IncomingMessage has already decoded transfer framing. Preserve a fixed
  // length when supplied; otherwise the response ends when this socket closes.
  headers.connection = 'close'
  const status = response.statusCode ?? 502
  const lines = [`HTTP/1.1 ${status} ${response.statusMessage ?? ''}`]
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value])
      lines.push(`${name}: ${item}`)
  }
  return `${lines.join('\r\n')}\r\n\r\n`
}

export async function startPreviewProxy(
  options: ProxyOptions,
): Promise<PreviewProxy> {
  const authenticate =
    options.password === undefined
      ? undefined
      : createAuthGate(options.password, options.now)
  const sockets = new Set<Socket>()
  const server = createServer((incoming, response) => {
    if (authenticate) {
      const status = authenticate(incoming.headers.authorization)
      if (status !== 200) {
        incoming.resume()
        rejectHttp(response, status)
        return
      }
    }
    void options.verifyTarget().then(
      () => {
        try {
          if (response.destroyed) return
          const upstream = httpRequest({
            host: '127.0.0.1',
            port: options.targetPort,
            method: incoming.method,
            path: incoming.url,
            headers: headersForOrigin(incoming, options),
          })
          upstream.on('response', (origin) => {
            const headers: OutgoingHttpHeaders = { ...origin.headers }
            removeHopByHop(headers)
            response.writeHead(origin.statusCode ?? 502, headers)
            origin.on('error', () => response.destroy())
            origin.on('close', () => {
              if (!origin.complete) response.destroy()
            })
            origin.pipe(response)
          })
          upstream.on('error', () => rejectHttp(response, 502))
          incoming.on('aborted', () => upstream.destroy())
          incoming.on('error', () => upstream.destroy())
          response.on('close', () => upstream.destroy())
          incoming.pipe(upstream)
        } catch {
          incoming.resume()
          rejectHttp(response, 502)
        }
      },
      () => {
        incoming.resume()
        rejectHttp(response, 502)
      },
    )
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  })
  server.on('upgrade', (incoming, socket, head) => {
    if (authenticate) {
      const status = authenticate(incoming.headers.authorization)
      if (status !== 200) {
        rejectSocket(socket, status)
        return
      }
      if (
        !validWebSocketOrigin(incoming.headers.origin, options.publicOrigin?.())
      ) {
        rejectSocket(socket, 403)
        return
      }
    }
    void options.verifyTarget().then(
      () => {
        try {
          if (socket.destroyed) return
          const headers = headersForOrigin(incoming, options)
          headers.connection = 'Upgrade'
          headers.upgrade = incoming.headers.upgrade
          const upstream = httpRequest({
            host: '127.0.0.1',
            port: options.targetPort,
            method: incoming.method,
            path: incoming.url,
            headers,
          })
          upstream.on('upgrade', (origin, originSocket, originHead) => {
            socket.write(responseHead(origin))
            if (originHead.length > 0) socket.write(originHead)
            if (head.length > 0) originSocket.write(head)
            originSocket.on('error', () => socket.destroy())
            socket.on('error', () => originSocket.destroy())
            originSocket.on('close', () => socket.destroy())
            socket.on('close', () => originSocket.destroy())
            socket.pipe(originSocket).pipe(socket)
          })
          upstream.on('response', (origin) => {
            socket.write(rejectedUpgradeHead(origin))
            origin.on('error', () => socket.destroy())
            origin.on('close', () => {
              if (!origin.complete) socket.destroy()
            })
            origin.pipe(socket)
          })
          upstream.on('error', () => rejectSocket(socket, 502))
          socket.once('close', () => upstream.destroy())
          upstream.end()
        } catch {
          rejectSocket(socket, 502)
        }
      },
      () => rejectSocket(socket, 502),
    )
  })
  server.headersTimeout = 10_000
  server.maxHeadersCount = 100
  server.maxConnections = 128
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
  } catch (cause) {
    throw new PeekError(
      'SERVER_START_ERROR',
      'Peek could not start its local preview proxy.',
      'Check local socket availability and retry.',
      cause,
    )
  }
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Preview proxy has no port')
  let closing: Promise<void> | undefined
  return {
    port: address.port,
    close: () => {
      if (closing) return closing
      closing = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        for (const socket of sockets) socket.destroy()
      })
      return closing
    },
  }
}
