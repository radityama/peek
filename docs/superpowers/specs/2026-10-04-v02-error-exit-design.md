# v0.2 Error and Exit Semantics

Status: approach and written spec approved in conversation on 2026-10-04.
Implementation follows the [phase plan](../plans/2026-10-04-v02-error-exit.md).

Baseline: main `a4c4797`, package `@usepeek/peek` 0.2.2. PRs #10 through #13
are merged with required and post-merge CI passing. Branch:
`feat/v02-exit-codes`.

## Goal and scope

Make existing failure statuses explicit and contract-tested. Fix inconsistent
JSON selection for help/version, retain actionable doctor diagnostics and
classify cache-directory creation failures at the provider boundary.

Keep the existing typed `PeekError` model. Add only a configuration-specific
internal code and a small failure-status helper. Add no category framework,
dependency, package export, CLI flag, JSON field or v0.3 runtime. Provider
selection, server verification, lifecycle ownership and reconnect policy stay
as established by the preceding phases.

Distinct domain exit numbers would improve numerical classification but
change existing automation behavior. A JSON-only fix leaves diagnostic gaps.
Prefer the approved status-preserving changes below.

## Error model and exit policy

`src/utils/errors.ts` owns the existing code, message, hint and optional cause.
Add `CONFIG_ERROR` for configuration access, TypeScript import and validation
failures. `PROJECT_INVALID` continues to describe malformed `package.json`.
Retain all other current codes; they already distinguish project selection,
package manager/executable availability, dev failure, discovery/port failure,
provider preparation/connection/configuration and cleanup.

Centralize failure mapping in `errorExitCode(error: unknown): 1 | 2` in that
module: `USAGE_ERROR` maps to 2; other expected and unexpected errors map to 1.
The code remains internal and is not added to JSON error payloads.

| Status | Meaning |
| --- | --- |
| 0 | Successful static information, successful completion or requested stop, and doctor with no failed check. |
| 1 | Project/configuration, command, dev, discovery, provider, cleanup or unexpected failure; doctor with a failed check. |
| 2 | CLI misuse, including unknown options/arguments, invalid flag ports and incompatible options. |
| 130 | First termination request was SIGINT. |
| 143 | First termination request was SIGTERM. |

Preserve current precedence: the first signal wins even if an error or cleanup
failure follows. Otherwise use the primary failure's status, then cleanup-only
failure status. Retain a doctor failure status when cleanup succeeds; warnings
alone do not make doctor fail. A live doctor's normal requested stop remains 0.
Set `process.exitCode` after awaited cleanup rather than forcing termination.

Preserve `formatError`: expected failures include the original hint, causes
are hidden by default, and verbose output uses the existing cause formatter.
Do not print raw error objects or access `Error.stack`. Unexpected failures
use the existing generic default message and status 1. This governs Peek's
error rendering; dev output remains wrapped or streamed as received.

## CLI parsing and static output

Use Citty's supported `parseArgs` with the complete current flag definitions.
Parse once and use the same result for static output selection and execution.
Keep the existing `dev` alias, doctor prefix handling and first `--` boundary.
Tokens after that boundary are dev argv, including tokens resembling Peek flags.

Recognize the existing literal information flags before startup:
`--help`/`-h` and `--version`/`-v`. Help takes precedence when both are present.
Static information bypasses preview validation and starts no provider or dev
process, matching the existing help behavior. Retain the current help text,
rendered with Citty, and the package version source.

Use the parsed JSON boolean for all paths. Preserve Citty 0.2.2's observed
runtime coercion rather than implementing a second boolean parser:

| Flags before `--` | Output mode |
| --- | --- |
| `--json`, `--json=true` | JSON |
| `--json=false`, `--no-json` | Human |
| `--json=false --json` | JSON |
| `--json --json=false` | Human |
| `--no-json --json`, `--json --no-json` | Human; explicit negation takes precedence in the current parser. |

The full definitions matter: a string option can consume a flag-looking value.
For example, `--port --json --help` must select human help because the parsed
port value consumed `--json`. Preserve existing coercion for other currently
accepted values; add no new boolean validator or syntax.

JSON static output continues through the typed writer as one existing `help`
or `version` event, with schemaVersion 1 and no timestamp. Human output keeps
its existing text. Return normally after writing so stdout drains and fixture
entry cleanup runs. Replace the automatic `runMain` dispatch that forces exit
for help; keep Citty for parsing and usage rendering.

Preserve execution's existing argv validation and lifecycle error handling.
Normalize unexpected parse/render failures through `formatError` as well.
Use parsed output/verbose options when available. If parsing itself fails
before output mode exists, leave stdout empty, write the generic formatted
diagnostic to stderr and use status 1. Do not add a parser injection framework
for this boundary.

## Doctor diagnostics

Keep check names, pass/warn/fail behavior, aggregate status and the network
warning policy. A failed check caused by `PeekError` uses that error's message
and hint as its remedy. Unexpected failures use the generic default diagnostic
and the existing check-specific remedy.

Verbose failed checks may include `detail` from the existing safe formatter;
default failed checks omit causes and raw error objects. A verbose load failure
must reveal its original cause message without reading `.stack`. The existing
JSON `doctor-check` already permits optional `detail`, so no event or field is
introduced. Keep network/cache success details and live-doctor stop behavior.

Use a small internal helper if the failed-check construction repeats. Do not
change doctor's provider diagnostics into a provider registry or new transport
API. Trusted config code remains capable of writing directly to stdout, as
documented by the JSON contract.

## Provider preparation diagnostics

`ensureCloudflared` currently creates the cache folder outside its error
wrapper. Wrap that operation's rejection as `CLOUDFLARED_INSTALL_ERROR`, with
an actionable writable-directory remedy and the original cause retained for
verbose output. A filesystem failure must occur before download or execution.

Keep the operation's current order, cache paths/modes, checksum validation,
pinned assets, download limits, archive handling, rename and temporary-file
cleanup. Do not move the installer cleanup block or broaden this change into
an installer redesign. A regular file at the cache root provides a deterministic
failure fixture across platforms; do not rely on chmod denial under a privileged
test user or assert one operating system's errno/message.

## Tests

Use the existing real CLI harness with separate stdout/stderr and independent
JSON contract validation. Make the helper's expected output mode explicit for
boolean-edge cases; do not compute expectations with the production parser.

- Static help/version in both output modes, assigned/negated/repeated JSON
  forms, existing short aliases, `dev`/doctor prefixes, combined information
  flags and the `--` boundary. Assert status 0, exact event framing where
  applicable and no provider/dev resource creation.
- Real preview with assigned JSON enabled; verify HTTP and actual cleanup.
  Application argv after `--` must retain flag-looking tokens.
- Actual misuse status 2, config failure status 1 and representative project,
  command/dev and provider failure status 1. Assert actionable diagnostics,
  default cause omission, verbose detail, parseable JSON and stopped resources.
  Use current injected process/provider seams and tiny fixtures as needed.
- Unit contracts for every existing error code plus CONFIG_ERROR and unknown
  errors, and config access/import/validation classification. Preserve CLI
  cleanup/signal precedence through the existing real process tests.
- Doctor failed-check remedies, default hidden cause, verbose original cause,
  failure status 1 and warning-only status 0. Inject only the network result;
  do not require public Cloudflare.
- Real cache-folder creation failure: typed provider error, useful hint,
  preserved cause and no fetch/launch. Retain checksum and cache tests.

Test first where behavior changes; existing checks may already pass when they
freeze baseline behavior. Do not invent a red result. Keep tests deterministic
and normal CI independent of public tunnels. Windows process-handler coverage
does not establish native console Ctrl+C; preserve that disclosed limitation.

## Documentation and compatibility

`docs/CLI.md` becomes the authoritative exit-policy and argument-semantics
location. Document numeric meanings, precedence, doctor warnings/failures and
the internal error taxonomy's relationship to formatted diagnostics. Link
from JSON and architecture documentation instead of duplicating the table.
`docs/JSON.md` remains authoritative for events and pre-1.0 compatibility.

Existing ordinary failures, config failures, misuse and signal statuses retain
their numbers. Static forms that previously selected the wrong stream or
returned misuse for version now return the requested information. Combined
JSON help/version now returns help, matching human behavior. Doctor prose and
remedies improve; message prose is not stable wire API. Event names, fields,
schema version, timestamp policy and lifecycle output remain unchanged.

Keep package version 0.2.2 during this phase. Record these user-facing fixes
for the later release classification; do not create a release or tag here.
Finite reconnect/exhaustion and concurrent-provider preconditions remain phase
6 work. Proxy/security/access semantics remain later v0.3 work.

## Delivery

After written-spec approval, create a detailed implementation plan and execute
only this phase on its branch and mandatory PR. Run targeted checks followed
by lint, typecheck, test, build, pack:check and smoke:pack sequentially. Preserve
command output and actual status metadata. Inspect artifact contents and report
installed smoke only for the flows it exercises.

Run the primary antislop gate and final review, push the reviewed implementation
and inspect all six required CI jobs at that exact head. Fix failures on this
branch. Mark ready and merge only after healthy review and CI; update clean
main with ff-only and inspect post-merge CI before the next phase.

## Verified upstream behavior

Context7 verified Citty's public parsing/usage APIs and Node 22's process and
filesystem APIs. Installed Citty 0.2.2 source and twelve separated-stream CLI
observations settle boolean assignment, negation and built-in priority details
omitted from the retrieved documentation.

- [Citty parseArgs](https://github.com/unjs/citty/blob/main/_autodocs/api-reference/parseArgs.md)
- [Citty runMain](https://github.com/unjs/citty/blob/main/_autodocs/api-reference/runMain.md)
- [Node 22 process exit behavior](https://nodejs.org/docs/latest-v22.x/api/process.html)
- [Node 22 filesystem promises](https://nodejs.org/docs/latest-v22.x/api/fs.html)
