import { execFile } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { windowsSnapshot } from '../../src/core/process-tree.js'

// Mirrors windowsJob's timeout so the probe reports how many real snapshots
// would have been killed by the production deadline.
const productionTimeoutMs = 1500

interface Sample {
  ms: number
  stdout: string
  error?: unknown
}

function windowsArgs(script: string): string[] {
  return [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString(
      'base64',
    ),
  ]
}

function run(script: string, timeout: number): Promise<Sample> {
  return new Promise((resolve) => {
    const started = performance.now()
    execFile(
      'powershell.exe',
      windowsArgs(script),
      {
        encoding: 'utf8',
        timeout,
        killSignal: 'SIGKILL',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout) =>
        resolve({
          ms: performance.now() - started,
          stdout: stdout ?? '',
          error: error ?? undefined,
        }),
    )
  })
}

function summary(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    count: samples.length,
    minMs: Math.round(sorted[0] ?? 0),
    medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    maxMs: Math.round(sorted[sorted.length - 1] ?? 0),
    atOrOverProductionTimeout: samples.filter((ms) => ms >= productionTimeoutMs)
      .length,
  }
}

it.skipIf(process.platform !== 'win32')(
  'measures the Windows CIM snapshot duration isolated and under discovery load',
  { timeout: 120_000 },
  async () => {
    const count = await run('(Get-CimInstance Win32_Process).Count', 30_000)

    const isolated: number[] = []
    for (let index = 0; index < 4; index += 1) {
      const sample = await run(windowsSnapshot, 30_000)
      expect(sample.error, `isolated snapshot ${index} failed`).toBeUndefined()
      isolated.push(sample.ms)
    }

    // Discovery concurrently enumerates processes and TCP listeners; reproduce
    // that contention while timing the production snapshot command.
    const load = run(
      `$deadline = [Diagnostics.Stopwatch]::StartNew(); while ($deadline.Elapsed.TotalSeconds -lt 12) { Get-CimInstance Win32_Process | Out-Null; Get-NetTCPConnection -ErrorAction SilentlyContinue | Out-Null }`,
      30_000,
    )
    const concurrent: number[] = []
    for (let index = 0; index < 4; index += 1) {
      const sample = await run(windowsSnapshot, 30_000)
      expect(
        sample.error,
        `concurrent snapshot ${index} failed`,
      ).toBeUndefined()
      concurrent.push(sample.ms)
    }
    await load

    console.info(
      'peek windows snapshot probe',
      JSON.stringify({
        productionTimeoutMs,
        processCount: count.error ? null : Number(count.stdout.trim()),
        processCountCommandMs: Math.round(count.ms),
        processCountError: count.error ? String(count.error) : null,
        isolated: summary(isolated),
        concurrent: summary(concurrent),
      }),
    )
  },
)
