import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

if (process.argv.includes('crash')) {
  console.error('fake server startup failed')
  process.exit(1)
}

if (process.argv.includes('hang')) {
  setInterval(() => {}, 1000)
} else {
  if (process.argv.includes('tree')) {
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      {
        stdio: 'ignore',
      },
    )
    console.log(`CHILD PID: ${child.pid}`)
  }
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('peek fixture ready')
  })
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address && typeof address !== 'string') {
      console.log(`PID: ${process.pid}`)
      console.log(`Local: http://localhost:${address.port}`)
    }
  })
  process.on('SIGTERM', () => server.close(() => process.exit(0)))
  process.on('SIGINT', () => server.close(() => process.exit(0)))
}
