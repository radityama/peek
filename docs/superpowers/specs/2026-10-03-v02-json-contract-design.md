# v0.2 JSON Contract Hardening

Status: typed contract and stream-test approach approved in conversation;
written spec awaiting review.

Baseline: `aaae639`, package `@usepeek/peek` 0.2.2. Integration harness PR #10
and lifecycle PR #11 are merged. Branch: `test/v02-json-contract`.

## Goal and scope

Make the existing `--json` interface explicit and testable without changing
its event names, required fields, schema version, or lifecycle behavior.
Use an internal TypeScript discriminated union and one typed writer. Add no
runtime dependency, package export, provider, proxy, auth, expiry, or v0.3 field.

The alternatives were runtime JSON Schema validation, which adds machinery
to an internally produced stream, and documentation plus stream tests alone,
which leaves producers untyped. The typed writer checks producers at compile
time; independent contract tests check the bytes consumers receive.

## Current wire format

Each nonempty stdout line is one JSON object followed by a newline. Child
output is escaped inside an event rather than copied directly to stdout.
Every event has `schemaVersion: 1` and a string `type` discriminator.

Events from `JsonOutput` also have `timestamp`: the emission time from
`new Date().toISOString()`, in UTC. It is a wall clock, not a sequence number:
timestamps may repeat or move backward. Stream order is stdout order.
The existing CLI `help` and `version` events omit timestamps. Preserve that
exception rather than silently changing their shapes.

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
| `error` | `message: string` | None |
| `doctor-check` | `name: string`, `status: 'pass' \| 'warn' \| 'fail'`, `message: string` | `remedy: string`, `detail: string` |
| `help` | `text: string` | None |
| `version` | `version: string` | None |

The metadata fields are additional required fields, except for the timestamp
exception above. Optional fields are absent when not supplied; do not serialize
undefined values or replace absence with null.

Current `state` values are `starting`, `waiting`, `connecting`, and
`reconnecting`. Internal lifecycle phases introduced by PR #11 are not wire
state values. Current warning kinds include `blocked-host`, `hmr-failed`,
`tunnel-dropped`, and `reconnect-failed`; `hmr-unverified` is an `info` message.
Keep state and warning payloads open strings so future values can be added.

URLs remain absolute URL strings, not nested objects. Public Cloudflare URLs
are HTTPS; local URLs use localhost, and LAN URLs use the selected private IPv4
address. The local test transport may use HTTP. Consumers must not infer a
provider from a test hostname or depend on a particular Quick Tunnel name.

`child-output.content` preserves the received chunk, including embedded newlines
and Unicode. Event boundaries are neither complete log lines nor a promise
about how the operating system splits process output.

## Producers and ownership

Define the event variants and metadata in one small internal UI module.
The union must cover all thirteen variants above. Typed writer inputs must
require each variant's payload and prevent arbitrary record fields from
overwriting `type`, `schemaVersion`, or the timestamp policy.

Route `JsonOutput` and CLI help/version through that writer. Keep `Output`
as the terminal/JSON composition boundary, keep the preview core's callbacks,
and leave the human renderer unchanged. Do not export the contract from the
npm package or build a generic event bus, validator framework, or schema tool.

Configuration remains trusted project code executed by jiti in Peek's process.
Arbitrary config code can write or replace stdout independently of Peek's
renderer. The contract covers Peek-produced events and wrapped dev output;
it does not promise isolation from arbitrary project code. Investigate this
boundary explicitly when testing config failures, document the assumption,
and record a direct-output limitation rather than introducing config sandboxing
or silently suppressing project logs in this phase.

## Errors, reconnect and shutdown

Preserve `error.message` as the existing formatted diagnostic, including its
remedy. Do not introduce a structured error code or stack field here; broader
exit/error semantics belong to the next dedicated phase. Causes remain subject
to existing verbose behavior. JSON framing must remain valid for newlines,
quotes and diagnostic text.

On a tunnel drop, current behavior is a `warning` with kind `tunnel-dropped`,
a `state` with value `reconnecting`, optional `reconnect-failed` warnings, then
another `ready` after successful connection. Initial failures need not emit
`reconnecting`; they retain the current connecting behavior. Messages embed
attempt details rather than providing a separate attempt field. The local URL
and dev process remain unchanged during tunnel replacement. Keep the current
retry policy; this phase does not bound retries.

No shutdown event currently exists. Preserve that behavior: consumers observe
EOF and the process status. A primary failure followed by a distinct cleanup
failure can produce two `error` events in that order. A cleanup-only failure
appears once. Signals retain 130/143; normal requested live-doctor completion
remains 0, ordinary failure 1, and CLI misuse 2 until the exit-code phase.

## Contract tests

Test expected wire shapes independently of the production union. Cover all
thirteen events, every required field, doctor optional-field presence and
absence, all doctor statuses, timestamps and their help/version exceptions.
Compare fixed fields explicitly rather than snapshotting changing clock values.

Capture stdout separately from stderr. Parse every nonempty stdout line and
require a trailing newline; do not concatenate stderr into a success parse.
Test escaped newlines, quotes, Unicode and both child output streams. Tests
must fail if a required field is removed, a type is wrong, JSON is malformed,
or a human log line escapes into the machine stream.

Use the existing real CLI harness for normal preview, reconnect, startup/config
errors, and shutdown diagnostics. Preserve PID/listener assertions before
fallback cleanup. Check a second `ready` has the same local URL, a usable
replacement transport, and the documented reconnect sequence. Match required
subsequences rather than timing-dependent complete log transcripts.

Test shipped help/version and CLI misuse with separated streams. Exercise
doctor renderer variants and CLI composition without external network access;
an internal injectable doctor operation is acceptable if needed for a real
subprocess case. It must remain test-only in use, with no CLI flag, env hook,
package export, or change to the default doctor implementation.

For LAN, cover the renderer shape and the actual CLI path where the host has
one eligible interface. Retain explicit platform/interface skips where real
success cannot be established. Do not label synthetic addresses as measured
LAN compatibility. Normal tests must not depend on public Cloudflare.

Demonstrate that contract assertions reject representative malformed records
and missing required fields. Keep validation helpers in tests; production
serialization should not pay for runtime schema checking.

## Documentation and compatibility

Create one authoritative JSON contract document and link it from CLI docs.
Include the event table, timestamp exception, string URL/error representation,
reconnect sequence, EOF shutdown policy, config trust boundary, and a small
consumer example that dispatches on `type`.

Describe this as a pre-1.0 interface, not permanent v1 stability. This hardening
phase preserves the current wire contract. Prefer additive optional fields
and events; consumers should ignore unknown fields, event types and open-string
values. Future `access` or `expiresAt` fields can follow that policy, but no
such field or meaning is implemented now. Document incompatible wire changes
in release notes and revise the schema version when required; consumers should
pin releases if they require unchanged behavior.

Do not make consumers compare whole objects or assume the last event is a
successful shutdown marker. Do not promise exact message prose, fixed ordering
of independent diagnostics, chunk sizes, or permanent pre-1.0 stability.

## Validation and delivery

Write the implementation plan only after written-spec approval. Keep this
phase on its dedicated branch and PR. Run focused contract/CLI tests and the
full local gate: lint, typecheck, test, build, pack check and packed smoke.
Inspect all six required CI jobs on the final reviewed commit and fix failures
on this branch. Inspect package contents; new internal modules must not add
package exports, dependencies or shipped fixtures.

Packed preview dogfooding remains the cross-cutting validation task. Classify
any user-visible JSON fix for the final v0.2.3 decision; do not bump or release
in this phase.
