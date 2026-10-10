# JSON output

`peek --json` writes newline-delimited JSON to stdout. Each nonempty line is
one object followed by a newline. Peek's logs and both dev-process streams
use events; human decoration and QR codes are disabled. Keep stderr separate
when consuming stdout.

This is a pre-1.0 interface. The v0.2 hardening pass preserves schema version 1
and existing event fields. Prefer additive optional fields and events;
consumers should ignore unknown fields, event types, state values and warning
kinds. Peek does not promise permanent v1 stability. Incompatible wire changes
will be documented in release notes and revise the schema version when
required. Pin package versions if your consumer needs unchanged behavior.

## Common fields and payloads

Every event has `schemaVersion: 1` and `type: string`. Runtime events also have
`timestamp`, the emission time from `new Date().toISOString()` in UTC.
`help` and `version` omit it. Timestamps are wall-clock values: they can repeat
or move backward. Use stdout order, not timestamp sorting.

Optional payload fields are absent when not supplied. Absence is not null.

| Event | Required payload | Optional payload |
| --- | --- | --- |
| `start` | None | None |
| `info` | `message: string` | None |
| `state` | `state: string`, `message: string` | None |
| `warning` | `kind: string`, `message: string` | None |
| `success` | `message: string` | None |
| `diagnostic` | `message: string` | None |
| `child-output` | `stream: 'stdout' \| 'stderr'`, `content: string` | None |
| `ready` | `localUrl: string`, `publicUrl: string` | None |
| `lan-ready` | `url: string` | None |
| `private-ready` | `url: string` | None |
| `access` | `mode: 'private' \| 'protected' \| 'public'` | `expiresAt: string` |
| `error` | `message: string` | None |
| `doctor-check` | `name: string`, `status: 'pass' \| 'warn' \| 'fail'`, `message: string` | `remedy: string`, `detail: string` |
| `help` | `text: string` | None |
| `version` | `version: string` | None |

Current state values are `starting`, `waiting`, `connecting`, and `reconnecting`.
They are output values rather than internal lifecycle phases. Current warning
kinds include `blocked-host`, `hmr-failed`, `tunnel-dropped`, and
`reconnect-failed`. Both fields remain open strings; an unverified HMR check
uses an `info` message.

URLs are absolute strings. Cloudflare public URLs use HTTPS, local URLs use
`http://localhost:<port>`, and LAN URLs use the selected private IPv4 address.
Test providers can use loopback HTTP. A `ready` URL may change on reconnect;
do not infer a provider or fixed hostname from it.

An `access` event follows each ready event. `private` means Peek has no public
tunnel, `protected` means its loopback proxy requires a password, and `public`
means the tunnel has no Peek authentication. `expiresAt` is UTC and appears
only with `--expires`; its value remains fixed across reconnects.
`private-ready` reports the local URL for `--private`. A `lan-ready` event also
has `mode: private` in its subsequent `access` event. These additive events
keep schema version 1.

`child-output.content` preserves each received chunk, including newlines,
quotes and Unicode. A chunk is not necessarily a complete log line. The
`stream` field identifies the child's original channel; both channels are
wrapped in events on Peek's stdout.

`error.message` contains the formatted diagnostic and remedy. It has no
structured error-code or stack field. Causes follow existing `--verbose`
behavior. Message prose and operating-system chunk sizes are not stable API.

## Reconnect and shutdown

A dropped tunnel emits `warning` with kind `tunnel-dropped`, then `state`
with value `reconnecting`. Failed replacement attempts can emit
`reconnect-failed` warnings. A successful replacement emits another `ready`
with the same local URL and the replacement connection's public URL; the dev
server keeps running.
Initial connection retries need not enter the reconnecting output state.
See [the lifecycle retry policy](ARCHITECTURE.md#progress-and-ownership).

Exhausted recovery emits the existing `error` event, then EOF and status 1 after
cleanup. The final failed attempt still emits `reconnect-failed`; the final
session drop still emits `tunnel-dropped` followed by `reconnecting`. No new event
or field is added. See the linked lifecycle policy for counting and reset.

There is no shutdown event. Observe EOF and process status. A primary failure
followed by a distinct cleanup failure can emit two `error` events, in that
order. A cleanup-only failure emits one. Do not treat the last event as a
successful shutdown marker or assume an exact transcript for independent
diagnostics.

See [exit statuses and diagnostic precedence](CLI.md#exit-statuses-and-diagnostics).
Live doctor requests a normal stop after its checks. Message prose can improve
within the pre-1.0 policy above without changing event shape or schema version.

## Trusted configuration

`peek.config.ts` executes trusted project code through jiti in Peek's process.
That code can write to or replace stdout independently of Peek's renderer.
The JSON contract covers Peek-produced events and wrapped dev output, with no
isolation guarantee for arbitrary config code. Keep config evaluation quiet
if a consumer needs an uninterrupted JSON stream.

## Consumer example

This Node.js example reads a piped stream. Run Peek separately and check its
exit status; the example's input EOF alone does not report Peek's success.

~~~js
import { createInterface } from 'node:readline'

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue
  const event = JSON.parse(line)
  if (event.schemaVersion !== 1) {
    throw new Error(`Unsupported Peek schema: ${event.schemaVersion}`)
  }
  switch (event.type) {
    case 'ready':
      console.error(`Preview: ${event.publicUrl}`)
      break
    case 'lan-ready':
      console.error(`LAN preview: ${event.url}`)
      break
    case 'error':
      console.error(event.message)
      break
  }
}
~~~

The consumer ignores other events and additional fields.
