import { appendFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'

const targetPort = Number(process.env.PEEK_TEST_TARGET_PORT)
const journal = (record) =>
  appendFileSync(process.env.PEEK_TEST_JOURNAL, `${JSON.stringify(record)}\n`)
const sockets = new Set()
const track = (socket) => {
  sockets.add(socket)
  socket.setTimeout(5000, () => socket.destroy())
  socket.on('close', () => sockets.delete(socket))
  socket.on('error', () => {})
}
const headers = (request) => ({
  ...request.headers,
  host: process.env.PEEK_TEST_HOST_HEADER ?? 'preview.peek.test',
})
const forward = (request) => {
  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: targetPort,
    method: request.method,
    path: request.url,
    headers: headers(request),
  })
  upstream.setTimeout(3000, () =>
    upstream.destroy(new Error('Fixture origin timed out')),
  )
  upstream.on('socket', track)
  return upstream
}
const server = createServer((request, response) => {
  const upstream = forward(request)
  upstream.on('response', (origin) => {
    response.writeHead(origin.statusCode, origin.headers)
    origin.on('error', () => response.destroy())
    origin.pipe(response)
  })
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502)
    response.end('Fixture origin unavailable')
  })
  request.on('error', () => upstream.destroy())
  response.on('close', () => upstream.destroy())
  request.pipe(upstream)
})
server.on('connection', track)
server.on('upgrade', (request, socket, head) => {
  const upstream = forward(request)
  socket.on('close', () => upstream.destroy())
  upstream.on('error', () => socket.destroy())
  upstream.on('response', (origin) => {
    socket.write(
      `HTTP/1.1 ${origin.statusCode} ${origin.statusMessage}\r\nConnection: close\r\n\r\n`,
    )
    origin.on('error', () => socket.destroy())
    origin.pipe(socket)
  })
  upstream.on('upgrade', (origin, originSocket, originHead) => {
    let response = `HTTP/1.1 ${origin.statusCode} ${origin.statusMessage}\r\n`
    for (let i = 0; i < origin.rawHeaders.length; i += 2)
      response += `${origin.rawHeaders[i]}: ${origin.rawHeaders[i + 1]}\r\n`
    socket.write(`${response}\r\n`)
    if (originHead.length) socket.write(originHead)
    if (head.length) originSocket.write(head)
    socket.on('close', () => originSocket.destroy())
    originSocket.on('close', () => socket.destroy())
    socket.pipe(originSocket).pipe(socket)
  })
  upstream.end()
})
server.on('error', (error) => {
  console.error(error)
  process.exit(8)
})
journal({
  role: 'transport',
  pid: process.pid,
  targetPort,
  attempt: Number(process.env.PEEK_TEST_ATTEMPT),
})
if (process.env.PEEK_TEST_PROVIDER_MODE === 'always-fail') {
  console.error('Fixture tunnel failed before listening')
  process.exit(11)
}
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port
  journal({
    role: 'transport',
    pid: process.pid,
    port,
    targetPort,
    attempt: Number(process.env.PEEK_TEST_ATTEMPT),
  })
  process.send?.({ type: 'listening', port })
})
let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  for (const socket of sockets) socket.destroy()
  server.close(() => process.exit(0))
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('disconnect', stop)
