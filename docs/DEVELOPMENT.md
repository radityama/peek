# Development

Peek is one Node.js package. Node.js 22+ and pnpm 11.20.0 are used for local
development. Enable pnpm with Corepack if it is not already available.

```sh
git clone https://github.com/radityama/peek.git
cd peek
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` rebuilds the CLI on source changes. In another terminal, use these
checks:

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm pack:check
pnpm smoke:pack
```

The last command packs the publishable files, installs that tarball in a
temporary directory, checks `peek --version` and `peek --help`, then removes
the directory. It does not start a public tunnel.

## Structure

`src/cli.ts` is the thin executable entry; `src/cli-command.ts` parses arguments,
composes dependencies and presents errors. `src/core` discovers the project,
runs the dev process, detects and verifies its port, and owns process cleanup.
`src/cloudflared` downloads and verifies the pinned binary. `src/tunnel`
contains the provider contract and Cloudflare implementation. `src/ui` formats
terminal output. `tests/unit` covers parsers and decisions; `tests/integration`
uses tiny fake server and tunnel processes to test readiness and lifecycle.
See [architecture](ARCHITECTURE.md) and [decisions](DECISIONS.md) for details.

## CLI integration tests

Vitest builds the shipped `dist/cli.js` and a separate injected entry once per
run. The shipped-entry tests cover commands such as help, version, doctor and
validation. Preview tests run the same CLI command body with a test provider
that starts a real loopback HTTP/WebSocket transport process. The injected
entry, provider, transport, fixtures and helpers stay outside the npm package.

Run the focused CLI checks with:

```sh
pnpm exec vitest run tests/integration/cli.test.ts tests/integration/cli-preview.test.ts tests/integration/cli-process.test.ts tests/integration/cli-websocket.test.ts tests/unit/lan.test.ts
```

These tests run a normal npm dev script, the default terminal output and JSON
output, explicit server commands, port rejection, Host rejection and the
existing localhost Host override. They also check startup crashes, recovery
from an initial connection failure, and replacement of a real transport after
the test terminates its recorded PID. Recovery must preserve the original dev
PID and verified port. WebSocket acceptance verifies the handshake and an
echoed text message, including partial frame reads and bytes sent with the
HTTP upgrade. A successful HTTP 101 alone is insufficient.

The lifecycle process tests interrupt discovery after the delayed dev process
is journalled, initial connection after a real transport listener opens, and
reconnect after the original transport drops and its replacement listens.
They check no late `ready`, preserving the original ready event during
reconnect. Repeated SIGINT/SIGTERM cases wait for a recorded provider shutdown
checkpoint before the second signal, verify forced transport closure, and
retain the first signal's exit status. Dev exit after readiness must stop the
transport without reconnecting. A POSIX fixture retains its HTTP listener
after SIGTERM, proving Peek escalates to SIGKILL.

JSON process cases cover cleanup rejection after a signal and an immediate
dev crash paired with a distinct cleanup rejection. They assert the actionable
remedy, primary error before cleanup error, expected exit status, every stdout
line parsing, empty stderr, and resource shutdown. The immediate startup crash
has no transport yet; the signal case closes a real transport before its
provider reports the cleanup failure. See [shutdown and diagnostics in the
architecture](ARCHITECTURE.md#shutdown-and-diagnostics) for the authoritative
waiting budgets and error behavior. Retry policy is documented under
[progress and ownership](ARCHITECTURE.md#progress-and-ownership).

Run the focused lifecycle gate with:

```sh
pnpm exec vitest run tests/integration/cli-process.test.ts tests/integration/lifecycle.test.ts tests/unit/lifecycle.test.ts tests/unit/cleanup.test.ts
```

The journal records process IDs and listening ports independently of CLI
output. Journal waits have bounded deadlines and diagnostic output tails.
Tests assert those processes stopped and ports closed before fallback
teardown can force cleanup. Temporary projects use `node ./dev.mjs` in their
npm script; the wrapper imports the fixture by file URL so paths with spaces
work without a leading quoted executable in Windows `cmd.exe`.

LAN success uses the machine's actual private IPv4 interface and binds the
fixture to `0.0.0.0`. It explicitly skips with a reason when the machine has
zero or multiple private addresses. A loopback-only subprocess still checks
LAN failure without tunnel preparation; unit tests deterministically check
missing and ambiguous addresses.

On POSIX, lifecycle tests send real SIGINT and SIGTERM and verify exit codes
130 and 143. On Windows, the injected entry receives a labelled IPC command
that invokes the signal handler; the resulting dev process and descendant
cleanup still runs through real Execa processes. This does not exercise native
Windows console Ctrl+C, which needs a separate manual stress test.
The SIGTERM-ignore fixture is skipped on Windows because Node's native
`process.kill` terminates the process unconditionally for SIGINT/SIGTERM/SIGKILL;
an IPC-invoked handler cannot prove graceful signal refusal on that platform.

The local transport proves forwarding and CLI recovery behavior. It does not
prove Cloudflare availability, TLS, public hostname handling, or framework
HMR compatibility. Host rejection uses a synthetic nonlocal Host value, and
the WebSocket echo server is a small fixture rather than a framework install.

## JSON contract tests

Run the focused contract checks with:

~~~sh
pnpm exec vitest run tests/unit/json-output.test.ts tests/integration/cli-json.test.ts tests/integration/cli-preview.test.ts tests/integration/cli-process.test.ts
~~~

The independent wire assertions cover all thirteen current event variants,
required fields, doctor optional fields/statuses, UTC timestamps, help/version
timestamp omissions, escaped chunks, malformed records and newline framing.
Real CLI tests keep stdout and stderr separate for help, version, misuse,
config errors, normal preview, eligible LAN preview, reconnect and cleanup
diagnostics. They check processes and listeners before fallback teardown.

The injected doctor runs real local checks and replaces only its network
operation; a passing fixture network check does not measure Cloudflare
reachability. A trusted config that logs directly to stdout deliberately
demonstrates the documented isolation limit. See [the JSON contract](JSON.md).

## Try the CLI locally

After `pnpm build`, run `node dist/cli.js --help`. To expose the local CLI as
`peek` on your PATH, run `npm link` from the repository, then `peek --version`.
Remove the link with `npm uninstall -g @usepeek/peek` when finished. pnpm
v11 no longer supports `pnpm link --global`. You can also avoid linking:

```sh
cd /path/to/a/project-with-a-dev-script
node /path/to/peek/dist/cli.js
```

The normal tests never connect to Cloudflare. To test the real integration,
run Peek from a disposable dev project, wait for both URLs, request the public
URL from a second device or `curl`, and press Ctrl+C. Check that the dev server
and `cloudflared` have exited. The first run downloads the pinned binary to
`~/.peek/bin`; subsequent runs reuse it. Do not share a project containing
private data unless its HTTP routes protect that data.

You can also run the existing opt-in checks from a disposable dev project:

```sh
node /path/to/peek/dist/cli.js doctor
node /path/to/peek/dist/cli.js doctor --live
node /path/to/peek/dist/cli.js --json
```

`doctor --live` and the JSON preview use the real Cloudflare provider and may
download the verified binary. The live doctor stops after its preview checks;
stop the JSON preview with Ctrl+C and inspect child cleanup as above.

## Release

Before tagging, update the package version and changelog together. Run all
checks above, inspect `npm pack --dry-run`, and manually test one real Quick
Tunnel. A `v<package version>` tag triggers `.github/workflows/release.yml`,
which rechecks the package and publishes to npm using GitHub OIDC and
provenance for future versions. The already-published `v0.2.2` is handled
separately below. The package name is `@usepeek/peek` and the repository is
`radityama/peek`. npm cannot replace a published version.

The GitHub environment is named `Publish to npm`. The trusted publisher must
name GitHub owner `radityama`, repository `peek`, workflow `release.yml`, and
that exact environment, with direct `npm publish` allowed. The repository is
public, as required for npm provenance. Do not put an npm token in GitHub
Actions. See [npm's trusted publisher
instructions](https://docs.npmjs.com/trusted-publishers/) and the
[npm trust command](https://docs.npmjs.com/cli/v11/commands/npm-trust).

Peek v0.2 uses `jiti` to load optional TypeScript config on Node 22.0.

### v0.2.2 scope migration

The initial `@usepeek/peek@0.2.2` publication already exists on npm. Its
tarball was compared file by file with the package built from the reviewed
canonical commit. npm cannot replace that version or add provenance to the
existing publication. The `v0.2.2` tag workflow verifies the published
tarball instead of publishing it again. Future release tags still publish
through the workflow with provenance.

The legacy source commit `ea91483620faf65ffe0b6e58e783f7f403c6893c` is
preserved on `release/legacy-v0.2.2-source`, so the canonical PR can be
squash-merged. Do not move either release tag or reuse either published version.

1. Squash-merge the reviewed canonical PR after the full gate passes. Create
   GitHub Release `v0.2.2` from the resulting `main` commit. The tag workflow
   must pass its package comparison. Verify a clean install, `peek --version`,
   `peek doctor`, a normal preview, and cleanup after Ctrl+C.
2. Sign in to npm with 2FA and configure a trusted publisher for the old
   package using the same `radityama/peek`, `release.yml`, and
   `Publish to npm` identity:

   ```sh
   npm trust list @radityprtama/peek
   npm trust github @radityprtama/peek --repo radityama/peek --file release.yml --env 'Publish to npm' --allow-publish
   ```

   If npm rejects the new connection because the old GitHub owner is still
   configured, revoke that obsolete entry by its listed ID with
   `npm trust revoke --id <old-id> @radityprtama/peek`, then repeat the
   `npm trust github` command. Confirm the new entry before tagging.
   Tag `ea91483620faf65ffe0b6e58e783f7f403c6893c` as
   `v0.2.2-legacy` and push the tag. The tag workflow checks the package
   identity and version before publishing. Verify
   `@radityprtama/peek@0.2.2` installs and shows its migration notice in an
   interactive preview. The old update checker still points at the old
   package so users of 0.2.1 can discover this final release.
3. Only after both packages work, deprecate the old name from an authenticated
   npm session:

   ```sh
   npm deprecate @radityprtama/peek "Moved to @usepeek/peek. Uninstall the old package and install @usepeek/peek to keep receiving updates."
   ```

   Check the deprecation message on the npm package page and during install.
   Remove the obsolete npm trusted publisher entry for the old GitHub owner
   after the final legacy publication succeeds.

## Repository rules

The `main` branch is protected by the active **Protect main** ruleset. Changes
go through pull requests, all six CI matrix checks must pass, and review
conversations must be resolved before merging. The rule applies to the
maintainer as well as contributors. While Peek has one maintainer, it requires
zero approving reviews; add a review requirement when another maintainer can
review changes. GitHub deletes merged branches automatically.

The active **Protect release tags** ruleset lets maintainers create new `v*`
tags but prevents moving or deleting existing ones. Create each release tag
from the verified `main` commit after completing the release checks above.
