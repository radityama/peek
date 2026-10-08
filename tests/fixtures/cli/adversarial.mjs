import { spawn } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const journal = (record) =>
  appendFileSync(process.env.PEEK_TEST_JOURNAL, `${JSON.stringify(record)}\n`)

if (process.argv.includes('--descendant')) {
  const server = createServer((_request, response) =>
    response.end('adversarial descendant'),
  )
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    journal({ role: 'dev-descendant', pid: process.pid, port })
    process.send?.({ type: 'descendant-ready', port })
  })
  if (process.env.PEEK_TEST_REFUSE_TERM === '1') {
    process.on('SIGTERM', () =>
      journal({ role: 'descendant-sigterm-ignored', pid: process.pid }),
    )
  }
  const lifetime = setInterval(() => {
    const stopFile = process.env.PEEK_TEST_STOP_FILE
    if (stopFile && existsSync(stopFile)) {
      clearInterval(lifetime)
      journal({ role: 'descendant-fallback-stop', pid: process.pid })
      process.exit(0)
    }
  }, 25)
} else {
  journal({ role: 'dev', pid: process.pid })
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '--descendant'],
    {
      env: process.env,
      stdio: [
        'ignore',
        process.env.PEEK_TEST_DESCENDANT_STDIO === 'ignore'
          ? 'ignore'
          : 'inherit',
        process.env.PEEK_TEST_DESCENDANT_STDIO === 'ignore'
          ? 'ignore'
          : 'inherit',
        'ipc',
      ],
    },
  )
  child.once('error', (error) => {
    throw error
  })
  child.once('message', async (message) => {
    if (message?.type !== 'descendant-ready') return
    console.log(`Fixture http://127.0.0.1:${message.port}`)
    const controlFile = process.env.PEEK_TEST_ROOT_EXIT_FILE
    if (controlFile) {
      journal({ role: 'root-waiting', pid: process.pid })
      while (!existsSync(controlFile)) await delay(25)
    }
    journal({ role: 'root-exiting', pid: process.pid })
    await delay(1)
    process.exit(7)
  })
}
