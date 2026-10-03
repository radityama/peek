import { appendFileSync } from 'node:fs'

appendFileSync(
  process.env.PEEK_TEST_JOURNAL,
  `${JSON.stringify({ role: 'descendant', pid: process.pid })}\n`,
)
setInterval(() => {}, 1000)
