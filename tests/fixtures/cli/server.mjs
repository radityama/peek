import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const mode = process.env.PEEK_TEST_MODE ?? 'announced'
const journal = (record) =>
  appendFileSync(process.env.PEEK_TEST_JOURNAL, `${JSON.stringify(record)}\n`)
journal({ role: 'dev', pid: process.pid, argv: process.argv.slice(2) })
console.log('fixture stdout')
console.error('fixture stderr')
if (mode === 'crash') process.exit(7)

const sockets = new Set()
const server = createServer((request, response) => {
  if (
    mode === 'blocked-host' &&
    !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.host ?? '')
  ) {
    response.writeHead(403)
    response.end(
      'Blocked request. This host is not allowed. Configure allowedHosts.',
    )
    return
  }
  if (request.url.startsWith('/echo')) {
    response.writeHead(200, {
      'x-fixture-method': request.method,
      'x-fixture-header': request.headers['x-fixture-header'] ?? '',
      'x-fixture-path': request.url,
    })
    request.pipe(response)
  } else response.end('peek fixture')
})
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.setTimeout(5000, () => socket.destroy())
  socket.on('close', () => sockets.delete(socket))
  socket.on('error', () => {})
})
server.on('upgrade', (request, socket, head) => {
  const key = request.headers['sec-websocket-key']
  if (
    request.method !== 'GET' ||
    request.headers.upgrade?.toLowerCase() !== 'websocket' ||
    request.headers['sec-websocket-version'] !== '13' ||
    typeof key !== 'string' ||
    Buffer.from(key, 'base64').length !== 16
  ) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    return
  }
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
  const protocol =
    request.headers['sec-websocket-protocol'] === 'vite-hmr'
      ? 'Sec-WebSocket-Protocol: vite-hmr\r\n'
      : ''
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${protocol}\r\n`,
  )
  let pending = Buffer.alloc(0)
  const consume = (chunk) => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= 2) {
      const opcode = pending[0] & 15
      const length = pending[1] & 127
      if (
        !(pending[0] & 128) ||
        !(pending[1] & 128) ||
        length > 125 ||
        (opcode !== 1 && opcode !== 8)
      ) {
        socket.destroy()
        return
      }
      if (pending.length < 6 + length) return
      const payload = Buffer.from(pending.subarray(6, 6 + length))
      for (let i = 0; i < length; i++) payload[i] ^= pending[2 + (i % 4)]
      pending = pending.subarray(6 + length)
      const frame = Buffer.concat([
        Buffer.from([128 | opcode, length]),
        payload,
      ])
      if (opcode === 8) {
        socket.end(frame)
        return
      }
      if (process.env.PEEK_TEST_WS_FRAGMENT === '1') {
        socket.write(frame.subarray(0, 1))
        setTimeout(() => {
          if (!socket.destroyed) socket.write(frame.subarray(1))
        }, 20)
      } else socket.write(frame)
    }
  }
  socket.on('data', consume)
  if (head.length) consume(head)
})
server.on('error', (error) => {
  console.error(error)
  process.exit(8)
})

let descendant
let descendantExited = false
if (mode === 'tree') {
  descendant = spawn(
    process.execPath,
    [fileURLToPath(new URL('./descendant.mjs', import.meta.url))],
    { stdio: 'ignore' },
  )
  journal({ role: 'descendant', pid: descendant.pid })
  descendant.on('exit', () => {
    descendantExited = true
  })
  descendant.on('error', (error) => {
    console.error(error)
    process.exit(9)
  })
}
const listen = () =>
  server.listen(
    Number(process.env.PEEK_TEST_PORT ?? 0),
    process.env.PEEK_TEST_BIND ?? '127.0.0.1',
    () => {
      const port = server.address().port
      journal({ role: 'dev', pid: process.pid, port })
      if (mode !== 'silent') console.log(`Fixture http://127.0.0.1:${port}`)
    },
  )
const startup =
  mode === 'delayed'
    ? setTimeout(listen, Number(process.env.PEEK_TEST_STARTUP_DELAY_MS ?? 350))
    : undefined
if (startup) journal({ role: 'dev-startup-wait', pid: process.pid })
if (!startup) listen()

let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  clearTimeout(startup)
  for (const socket of sockets) socket.destroy()
  server.close(() => {
    // Peek owns descendant termination. Keep the parent alive to reap its exit.
    if (descendant && !descendantExited)
      descendant.once('exit', () => process.exit(0))
    else process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', () => {
  if (mode === 'ignore-sigterm') {
    journal({
      role: 'dev-sigterm-ignored',
      pid: process.pid,
      port: server.address().port,
    })
  } else stop()
})
