# v0.3 resource-efficiency benchmark

This document covers the first-`cloudflared`-download measurement. Proxy request
latency is covered by the port-verification benchmark (PR #24). Both are local
synthetic fixtures; they do not measure Cloudflare or constrained CI hosts.

## First cloudflared download

Run `PEEK_BENCHMARK_OUTPUT=/tmp/peek-binary-bench.jsonl pnpm exec vitest bench tests/bench/binary.bench.ts`
from a checked-out commit. The benchmark serves a synthetic 40 MiB body from a
`ReadableStream`, runs `ensureCloudflared` against it, and samples
`process.memoryUsage().rss` every 2 ms to record the peak delta. Each line
reports `sizeBytes`, `elapsedMs`, and `peakRssDeltaBytes`.

The following runs used Linux x86_64, Node v24.16.0, and a four-vCPU QEMU host
on 2026-10-09. The baseline was commit `9e3e402` (buffered download and
whole-file cache hashing); the updated run used this branch (streamed download
and incremental hashing). Three runs each; the table lists the median.

| Metric | Baseline | Streamed | Change |
| --- | ---: | ---: | ---: |
| Peak RSS delta | 129.5 MB | 34.1 MB | 3.8× lower |
| Elapsed | 393 ms | 320 ms | 1.2× faster |

The baseline held the response chunks and the joined `Buffer` in memory, then
read the whole verified file back for hashing. Streaming writes through a size
checking, hashing `Transform` into the temporary file, so peak memory no longer
scales with asset size. The residual ~34 MB delta is V8 heap that grows during
the run and is not returned to the OS; it is not retained asset bytes. The
100 MB asset limit, timeout, trusted-redirect check, atomic rename, and
per-file checksum verification are unchanged.

## Proxy request latency

The port-verification benchmark (PR #24) measures sequential and concurrent
proxy request latency. It is not repeated here.
