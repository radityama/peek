import { appendFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, test } from 'vitest'
import { type CliHandle, startCli } from '../helpers/cli.js'

const handles: CliHandle[] = []
let directUrl = ''
let publicUrl = ''
let protectedUrl = ''
const authorization = `Basic ${Buffer.from('peek:benchmark-secret').toString('base64')}`

beforeAll(async () => {
  const publicPreview = await startCli()
  handles.push(publicPreview)
  const publicReady = await publicPreview.waitForEvent('ready')
  directUrl = String(publicReady.localUrl)
  publicUrl = String(publicReady.publicUrl)
  const protectedPreview = await startCli({
    args: ['--json', '--password'],
    env: { PEEK_TEST_PASSWORD: 'benchmark-secret' },
  })
  handles.push(protectedPreview)
  protectedUrl = String(
    (await protectedPreview.waitForEvent('ready')).publicUrl,
  )
}, 30_000)

afterAll(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.dispose()))
})

async function request(
  url: string,
  headers?: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, headers ? { headers } : {})
  if (response.status !== 200) throw new Error(`Unexpected ${response.status}`)
  await response.arrayBuffer()
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0
}

async function measure(
  label: string,
  run: () => Promise<void>,
  iterations = 30,
): Promise<void> {
  for (let index = 0; index < 5; index++) await run()
  const samples: number[] = []
  const cpu = process.cpuUsage()
  const rss = process.memoryUsage().rss
  const start = performance.now()
  for (let index = 0; index < iterations; index++) {
    const began = performance.now()
    await run()
    samples.push(performance.now() - began)
  }
  const elapsed = performance.now() - start
  samples.sort((a, b) => a - b)
  const used = process.cpuUsage(cpu)
  const metrics = JSON.stringify({
    label,
    iterations,
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    requestsPerSecond: (iterations * 1000) / elapsed,
    cpuMs: (used.user + used.system) / 1000,
    rssDeltaBytes: process.memoryUsage().rss - rss,
  })
  const output = process.env.PEEK_BENCHMARK_OUTPUT
  if (output) appendFileSync(output, `${metrics}\n`)
  else console.info(metrics)
}

test('local preview request benchmark', async () => {
  await measure('direct', () => request(directUrl))
  await measure('public proxy', () => request(publicUrl))
  await measure('protected proxy', () =>
    request(protectedUrl, { authorization }),
  )
  await measure(
    'public proxy concurrent groups of eight',
    () =>
      Promise.all(Array.from({ length: 8 }, () => request(publicUrl))).then(
        () => {},
      ),
    15,
  )
}, 120_000)
