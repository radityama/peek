import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { test } from 'vitest'
import { ensureCloudflared } from '../../src/cloudflared/binary.js'
import type { CloudflaredAsset } from '../../src/cloudflared/platform.js'

test('synthetic 40 MiB first download', async () => {
  const chunk = Buffer.alloc(64 * 1024, 0x61)
  const chunks = 640
  const hash = createHash('sha256')
  for (let index = 0; index < chunks; index++) hash.update(chunk)
  const digest = hash.digest('hex')
  const asset: CloudflaredAsset = {
    name: 'cloudflared-linux-amd64',
    url: 'https://github.com/cloudflare/cloudflared/releases/download/2026.9.1/cloudflared-linux-amd64',
    assetSha256: digest,
    binarySha256: digest,
    archive: false,
  }
  const directory = await mkdtemp(join(tmpdir(), 'peek-binary-bench-'))
  const baseline = process.memoryUsage().rss
  let peak = baseline
  const sample = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss)
  }, 2)
  const began = performance.now()
  try {
    const fetcher: typeof fetch = async () => {
      let sent = 0
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= chunks) controller.close()
          else {
            controller.enqueue(chunk)
            sent++
          }
        },
      })
      return new Response(body)
    }
    await ensureCloudflared({
      cacheDir: directory,
      asset,
      fetcher,
      platform: 'linux',
      arch: 'x64',
    })
    peak = Math.max(peak, process.memoryUsage().rss)
    const metrics = JSON.stringify({
      sizeBytes: chunk.length * chunks,
      elapsedMs: performance.now() - began,
      peakRssDeltaBytes: peak - baseline,
    })
    const output = process.env.PEEK_BENCHMARK_OUTPUT
    if (output) appendFileSync(output, `${metrics}\n`)
    else console.info(metrics)
  } finally {
    clearInterval(sample)
    await rm(directory, { recursive: true, force: true })
  }
}, 120_000)
