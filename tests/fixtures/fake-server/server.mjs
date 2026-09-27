import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

if (process.argv.includes('crash')) {
  console.error('fake server startup failed')
  process.exit(1)
}

if (process.argv.includes('hang')) {
  setInterval(() => {}, 1000)
} else {
  let child
  if (process.argv.includes('tree')) {
    child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      {
        stdio: 'ignore',
      },
    )
    console.log(`CHILD PID: ${child.pid}`)
  }
  const server = createServer((request, response) => {
    if (
      process.argv.includes('host-block') &&
      request.headers.host !== 'localhost'
    ) {
      response.writeHead(403, { 'content-type': 'text/plain' })
      response.end('Blocked request. This host is not allowed.')
      return
    }
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
  const stop = () => {
    server.close(() => {
      if (!child || child.exitCode !== null || child.signalCode !== null) {
        process.exit(0)
        return
      }
      child.once('exit', () => process.exit(0))
      child.kill('SIGTERM')
    })
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
