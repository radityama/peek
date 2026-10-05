import { spawn } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const journal = (record) =>
  appendFileSync(process.env.PEEK_TEST_JOURNAL, `${JSON.stringify(record)}\n`)

if (process.argv.includes('--descendant')) {
  journal({ role: 'dev-descendant', pid: process.pid })
  process.send?.({ type: 'descendant-ready' })
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
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    },
  )
  child.once('error', (error) => {
    throw error
  })
  child.once('message', async (message) => {
    if (message?.type !== 'descendant-ready') return
    journal({ role: 'root-exiting', pid: process.pid })
    await delay(1)
    process.exit(7)
  })
}
