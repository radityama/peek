# CLI

```text
peek [options]
peek dev [options]
peek [options] -- <executable> [arguments...]
peek doctor [--live] [--json]
```

`peek dev` is an alias for `peek`. There is no `peek run` command.
The `--` form keeps executable and argument boundaries intact and never uses
a shell.

| Option | Behavior |
| --- | --- |
| `--port <number>` | Select port 1–65535. Peek fails if it was occupied before startup. |
| `--provider cloudflare` | Select the sole provider. Any other value fails. |
| `--qr` | Request QR output when stdout is an interactive, sufficiently large terminal. |
| `--no-qr` | Turn QR output off. |
| `--verbose` | Show Cloudflare log lines and error causes. |
| `--help` | Show usage without starting a process. |
| `--version` | Show package version. |
| `--lan` | Show a LAN URL and QR without starting or downloading a tunnel. The dev server must listen on the LAN address. |
| `--json` | Write versioned, newline-delimited JSON events, including child output. No QR or human-readable decoration. See the [JSON event contract](JSON.md). |
| `--live` | With `peek doctor`, start a temporary tunnel and run preview checks. |
| `--host-header localhost` | Ask `cloudflared` to send `Host: localhost` to the dev server when it rejects the temporary hostname. |

Without `--qr` or `--no-qr`, Peek shows a QR code when terminal size permits.
The HTTPS URL always appears as text. `--qr` cannot force an unusable QR into
a narrow or noninteractive terminal.

## Argument and output selection

Help (`--help` or `-h`) and version (`--version` or `-v`) do not load project
config or start a dev server/tunnel. Help takes precedence when both are
requested. Peek accepts them with output flags and the dev/doctor prefixes.

`--json` and `--json=true` select JSON; `--json=false` and `--no-json` select
human output. Repeated positive/assigned JSON values use the last value.
The current parser applies explicit `--no-json` after positive flags, so
negation wins in either order. All flags before `--` use the same parser for
static output and execution. A string option consumes its next value even
when that value looks like another flag. Put Peek flags before `--`; tokens
after it belong to the application unchanged.

## Exit statuses and diagnostics

| Status | Meaning |
| --- | --- |
| 0 | Successful information/completion or requested stop; doctor has no failed check. |
| 1 | Project/config, command, dev, discovery, provider, cleanup or unexpected failure; doctor has a failed check. |
| 2 | CLI misuse: unknown option/argument, invalid flag port or incompatible options. |
| 130 | The first termination request was SIGINT. |
| 143 | The first termination request was SIGTERM. |

The first signal retains its status through cleanup and repeated signals.
Otherwise the primary failure sets the status; a cleanup-only failure uses 1.
A requested stop by live doctor is successful. Doctor warnings alone,
including an unreachable HTTPS check, do not cause status 1.

Internally, PeekError distinguishes config, project/package manager, dev,
discovery/port, provider and cleanup failures. These codes are not JSON fields
or distinct process statuses. Default diagnostics include actionable remedies;
`--verbose` adds causes without printing stacks. Doctor preserves a failed
check's original remedy and adds failed-check detail only with `--verbose`.
Message prose is not stable API. See the [JSON contract](JSON.md) for event
and pre-1.0 compatibility rules.

If argument parsing fails before an output mode can be selected, stdout stays
empty and Peek writes its formatted diagnostic to stderr with status 1.
Ordinary parsed JSON failures remain error events on stdout.

## Examples

```sh
peek
peek dev
peek --port 5173
peek --qr
peek --no-qr
peek --verbose
peek --help
peek --version
peek -- npm start
peek --port 3000 -- node server.js
peek --lan -- node server.js
peek --json
peek --host-header localhost
peek doctor
peek doctor --live
```

Flags go before `--`. With the explicit form, Peek starts the named executable
directly in the current working directory; it does not require `package.json`.
For the normal form, package manager priority is `packageManager` in
`package.json`, then one recognized lockfile, then npm. Conflicting lockfiles
without `packageManager` fail with instructions to resolve the ambiguity.

Port selection follows:

```text
--port or config port (if provided, verify this port or fail)
  otherwise ↓
unique local URL or port announced by the dev process
  ↓
child-owned listening socket
  ↓
unique common port that opened after startup
  ↓
actionable detection error
```

Each candidate must accept a TCP connection on `127.0.0.1`. An explicit port
already in use before startup is rejected. Peek does not blindly assume port
3000. A silent server on an unusual port may require `--port`.

## Optional project configuration

Place `peek.config.ts` in the project root when automatic command or port
detection needs help. The command is an argv array, never a shell string:

```ts
import { defineConfig } from '@usepeek/peek/config'

export default defineConfig({
  command: ['bun', 'run', 'dev'],
  port: 3000,
  provider: 'cloudflare',
  qr: true,
})
```

The import requires Peek to be installed in the project. A plain default-exported
object also works when Peek is installed globally. Explicit CLI flags and
tokens after `--` override config values. `peek` needs no config in a normal
project. A config file runs as trusted project code. Peek uses `jiti` to load
TypeScript on the full Node 22+ range.

`peek doctor` reports Peek and Node versions, OS and architecture, project and
package manager detection, the selected command, config, the pinned
cloudflared version and cached binary checksum, HTTPS access, and
socket-inspection tools. The HTTPS check does not prove that outbound tunnel
port 7844 is open. `--verbose` adds safe detail about the cache and network
checks and includes causes for failed checks. `--live` also starts a
preview, checks blocked-host responses and supported HMR upgrades, then stops
the server and tunnel. A failed HMR check warns; unsupported HMR endpoints
receive no status claim.

When a framework rejects the random Quick Tunnel hostname, Peek prints a
specific warning. Retry with `peek --host-header localhost`; this changes the
Host header received by the dev server and may affect apps that build absolute
URLs from that header. Peek accepts only `localhost` as the override.
