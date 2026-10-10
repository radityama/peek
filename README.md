# Peek

Run your dev server. Share it instantly.

Peek starts a project's development server, finds its local port, and creates a
temporary public HTTPS URL with a Cloudflare Quick Tunnel. It is built for
remote machines, SSH sessions, mobile terminals, and cloud development
environments where opening `localhost` is inconvenient.

## Install

Node.js 22 or newer is required. Peek itself runs on Node.js; a project may use
pnpm, npm, Yarn, or Bun.

```sh
pnpm add -g @usepeek/peek
```

`npm install -g @usepeek/peek` also works. Peek downloads a pinned,
checksum-verified `cloudflared` binary on first use and reuses it afterward.
You do not need to install `cloudflared` yourself.

If you installed `@radityprtama/peek`, replace it with `@usepeek/peek` using
the same package manager to keep receiving updates. For npm:

```sh
npm uninstall --global @radityprtama/peek
npm install --global @usepeek/peek
```

For pnpm, run `pnpm remove -g @radityprtama/peek` followed by
`pnpm add -g @usepeek/peek`.

## Quick start

```sh
cd my-project
peek
```

The project needs a `dev` script in its `package.json`. Peek runs the detected
package manager's `dev` command, waits for a reachable server, then connects
the tunnel. Press Ctrl+C to stop both processes.

```text
Peek

✓ pnpm project
· Preparing tunnel engine...
· Starting pnpm dev...
· Waiting for server...
✓ Server ready on :3000
· Connecting tunnel...
✓ Tunnel connected

Local   http://localhost:3000
Public  https://example-words.trycloudflare.com

PUBLIC PREVIEW      Anyone with this URL can access the service.

Press Ctrl+C to stop
```

The public URL changes each run. Peek uses Cloudflare's Quick Tunnel service;
it does not operate a relay or require a Peek account.

When a newer Peek version is available, interactive previews show an update
notice after the preview URL is ready. The check runs in the background and
never installs anything. Successful and failed checks are cached for 24 hours
under `~/.peek`. Run `npm install --global @usepeek/peek@latest` to update,
or set `NO_UPDATE_NOTIFIER=1` to disable checks. Peek skips checks in `--json`
mode, CI, and test environments. The registry request contains no project or
preview information.

## Commands

| Command | Purpose |
| --- | --- |
| `peek` | Detect and run the current project's `dev` script. |
| `peek dev` | Alias for `peek`. |
| `peek --port 5173` | Use the specified server port after checking it was free before startup. |
| `peek --qr` | Show a terminal QR code when the terminal can display it. |
| `peek --no-qr` | Suppress the QR code. |
| `peek --provider cloudflare` | Select the Cloudflare provider. |
| `peek --verbose` | Show Cloudflare diagnostics and error details. |
| `peek --host-header localhost` | Fix a dev server that rejects the temporary tunnel hostname. |
| `peek -- npm start` | Run an explicit executable and arguments instead of a `dev` script. |
| `peek --lan` | Share on the local network without a tunnel. |
| `peek --private` | Keep Peek's preview local without starting a tunnel. |
| `peek --public` | Explicitly share without Peek authentication. |
| `peek --password` | Prompt privately and require a password for tunnel requests. |
| `peek --expires 30m` | Stop the preview automatically after it becomes ready. |
| `peek --json` | Emit newline-delimited JSON events for scripts and agents. |
| `peek doctor` | Check the local setup, binary cache, network, and port inspection. |
| `peek doctor --live` | Start a temporary preview and check its host and HMR behavior. |
| `peek --help` / `peek --version` | Show help or version. |

Flags go before `--`; tokens after it are passed as an executable and arguments
without a shell. See [CLI details](https://github.com/radityama/peek/blob/main/docs/CLI.md) for precedence and examples.

An optional `peek.config.ts` can set an argv-array command, port, provider, and
QR preference. CLI flags take precedence.

Peek supports pnpm, npm, Yarn, and Bun projects. Its managed tunnel binary
supports Linux x64/ARM64, macOS x64/ARM64, and Windows x64. Linux and macOS
are the primary reliability targets. Silent servers on unusual ports may
need `--port`.

## Security

**A plain Peek public URL is available to anyone who has it.** Use
`peek --password` to require HTTP Basic authentication at Peek's local proxy.
The terminal prompts without echoing; in a browser, enter `peek` as the user
name and your chosen password. Peek uses the `Authorization` header for that
check, so an application that needs its own `Authorization` header cannot
receive it through a protected preview. `--private` starts no public tunnel.
Peek cannot change the dev server's own network bind address, and Cloudflare
still carries protected tunnel traffic. Peek does not upload source code or
collect telemetry. Read the [security guide](https://github.com/radityama/peek/blob/main/docs/SECURITY.md)
before sharing a sensitive preview.

Cloudflare says Quick Tunnels are for testing and development, with no uptime
guarantee. They currently do not support Server-Sent Events and limit
concurrent proxied requests. See [Cloudflare's Quick Tunnel
documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Development

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

See [development](https://github.com/radityama/peek/blob/main/docs/DEVELOPMENT.md)
for local linking and release checks, and
[troubleshooting](https://github.com/radityama/peek/blob/main/docs/TROUBLESHOOTING.md)
if startup fails. The v0.3 [live verification record](https://github.com/radityama/peek/blob/main/docs/LIVE-VERIFICATION.md)
documents the real Quick Tunnel checks and their environment limits.

## Contributing and support

Contributions are welcome. Read the [contributing guide](CONTRIBUTING.md) and
[Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request. Use
[issues](https://github.com/radityama/peek/issues)
for reproducible bugs and focused feature requests, and
[Discussions](https://github.com/radityama/peek/discussions) for questions
and early ideas. For help, see the [support guide](.github/SUPPORT.md).
Report vulnerabilities through [private vulnerability
reporting](https://github.com/radityama/peek/security/advisories/new).

## Roadmap and license

v0.3 adds a local reverse proxy, password protection, expiry, and explicit
access modes to the v0.2 reliability features. Additional providers are ideas
for later releases, not commitments. See the
[roadmap](https://github.com/radityama/peek/blob/main/docs/ROADMAP.md).

Peek is released under the [MIT license](https://github.com/radityama/peek/blob/main/LICENSE). The downloaded
`cloudflared` binary is a separate Cloudflare component with its own
[license and terms](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/#legal).
