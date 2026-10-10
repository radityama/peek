# v0.3 port verification benchmark

Run `PEEK_BENCHMARK_OUTPUT=/tmp/peek-benchmark.jsonl pnpm exec vitest bench tests/bench/preview.bench.ts` from a checked-out commit. The benchmark starts two local CLI previews with the fake tunnel transport. It measures 30 sequential requests per mode after five warmups, then 15 groups of eight concurrent public requests. Direct means a request to the dev server. CPU and RSS deltas describe the benchmark worker, not the child CLI processes. Results include local socket overhead; they do not measure Cloudflare.

The following runs used Linux x86_64, Node v24.16.0, and a four-vCPU QEMU host on 2026-10-09. The baseline was commit `6e9de13`; the updated run used the verification coordinator in this branch. Measurements are one run per commit and may vary with host load.

| Mode | Baseline median / p95 | Updated median / p95 | Baseline req/s | Updated req/s |
| --- | ---: | ---: | ---: | ---: |
| Direct | 0.47 / 1.04 ms | 0.67 / 1.14 ms | 1,695 | 1,311 |
| Public proxy | 5.52 / 10.56 ms | 1.88 / 4.25 ms | 169 | 442 |
| Protected proxy | 5.31 / 10.39 ms | 1.65 / 2.93 ms | 175 | 502 |
| Public proxy, groups of eight | 17.02 / 22.20 ms per group | 5.28 / 8.58 ms per group | 56 groups/s | 177 groups/s |

The public and protected modes improve because successful listener inspection is reused for one second and simultaneous requests share one inspection. A failed inspection is never cached. These Linux results do not establish Windows or macOS performance; CI on those platforms remains the release gate.
