import { createHash, timingSafeEqual } from 'node:crypto'
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

export interface PreviewProxy {
  readonly port: number
  close(): Promise<void>
}

export interface ProxyOptions {
  targetPort: number
  verifyTarget: () => Promise<void>
  password?: string
  originHostHeader?: 'localhost'
}

function headersForOrigin(
  incoming: IncomingMessage,
  options: ProxyOptions,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = { ...incoming.headers }
  delete headers.connection
  delete headers['proxy-authorization']
  delete headers['proxy-connection']
  if (options.password !== undefined) delete headers.authorization
  if (options.originHostHeader) headers.host = options.originHostHeader
  return headers
}

function authorized(header: string | undefined, digest: Buffer): boolean {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(header ?? '')
  if (!match) return false
  const encoded = match[1]
  if (!encoded) return false
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.toString('base64') !== encoded) return false
  const credential = decoded.toString('utf8')
  if (!credential.startsWith('peek:')) return false
  const supplied = createHash('sha256').update(credential.slice(5)).digest()
  return timingSafeEqual(supplied, digest)
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
  })
  response.end(
    status === 401
      ? 'Authentication required\n'
      : 'Preview server unavailable\n',
  )
}

function rejectSocket(socket: Duplex, status: number): void {
  if (socket.destroyed) return
  const reason = status === 401 ? 'Unauthorized' : 'Bad Gateway'
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Cache-Control: no-store\r\n' +
      (status === 401
        ? 'WWW-Authenticate: Basic realm="Peek preview", charset="UTF-8"\r\n'
        : '') +
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

export async function startPreviewProxy(
  options: ProxyOptions,
): Promise<PreviewProxy> {
  const digest =
    options.password === undefined
      ? undefined
      : createHash('sha256').update(options.password).digest()
  const sockets = new Set<Socket>()
  const server = createServer((incoming, response) => {
    if (digest && !authorized(incoming.headers.authorization, digest)) {
      incoming.resume()
      rejectHttp(response, 401)
      return
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
            response.writeHead(origin.statusCode ?? 502, origin.headers)
            origin.on('error', () => response.destroy())
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
  })
  server.on('upgrade', (incoming, socket, head) => {
    if (digest && !authorized(incoming.headers.authorization, digest)) {
      rejectSocket(socket, 401)
      return
    }
    void options.verifyTarget().then(
      () => {
        try {
          if (socket.destroyed) return
          const headers = headersForOrigin(incoming, options)
          headers.connection = 'Upgrade'
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
            socket.write(responseHead(origin))
            origin.on('error', () => socket.destroy())
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
