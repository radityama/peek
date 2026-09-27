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
pnpm add -g @radityprtama/peek
```

`npm install -g @radityprtama/peek` also works. Peek downloads a pinned,
checksum-verified `cloudflared` binary on first use and reuses it afterward.
You do not need to install `cloudflared` yourself.

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

Press Ctrl+C to stop
```

The public URL changes each run. Peek uses Cloudflare's Quick Tunnel service;
it does not operate a relay or require a Peek account.

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
| `peek -- npm start` | Run an explicit executable and arguments instead of a `dev` script. |
| `peek --lan` | Share on the local network without a tunnel. |
| `peek --json` | Emit newline-delimited JSON events for scripts and agents. |
| `peek doctor` | Check the local setup, binary cache, network, and port inspection. |
| `peek doctor --live` | Start a temporary preview and check its host and HMR behavior. |
| `peek --help` / `peek --version` | Show help or version. |

Flags go before `--`; tokens after it are passed as an executable and arguments
without a shell. See [CLI details](https://github.com/radityprtama/peek/blob/main/docs/CLI.md) for precedence and examples.

An optional `peek.config.ts` can set an argv-array command, port, provider, and
QR preference. CLI flags take precedence.

Peek supports pnpm, npm, Yarn, and Bun projects. Its managed tunnel binary
supports Linux x64/ARM64, macOS x64/ARM64, and Windows x64. Linux and macOS
are the primary reliability targets. Silent servers on unusual ports may
need `--port`.

## Security

**A Peek public URL exposes the selected local service to anyone who has the
URL for as long as the tunnel is running.** Peek does not add authentication;
an unpredictable URL is not a password. Do not run Peek against a server that
contains secrets, private data, or unsafe development endpoints unless that
server protects them itself. Peek sends web traffic through Cloudflare, but
does not upload source code or collect telemetry. Read the [security
guide](https://github.com/radityprtama/peek/blob/main/docs/SECURITY.md) before sharing sensitive previews.

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

See [development](https://github.com/radityprtama/peek/blob/main/docs/DEVELOPMENT.md)
for local linking and release checks, and
[troubleshooting](https://github.com/radityprtama/peek/blob/main/docs/TROUBLESHOOTING.md)
if startup fails.

## Contributing and support

Contributions are welcome. Read the [contributing guide](CONTRIBUTING.md) and
[Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request. Use
[issues](https://github.com/radityprtama/peek/issues)
for reproducible bugs and focused feature requests, and
[Discussions](https://github.com/radityprtama/peek/discussions) for questions
and early ideas. For help, see the [support guide](.github/SUPPORT.md).
Report vulnerabilities through [private vulnerability
reporting](https://github.com/radityprtama/peek/security/advisories/new).

## Roadmap and license

v0.2 adds LAN sharing, tunnel reconnection, diagnostics, and optional project
configuration to automatic server discovery, temporary Cloudflare tunnels,
QR output, and coordinated cleanup. Additional providers are ideas for later
releases, not commitments. See the
[roadmap](https://github.com/radityprtama/peek/blob/main/docs/ROADMAP.md).

Peek is released under the [MIT license](https://github.com/radityprtama/peek/blob/main/LICENSE). The downloaded
`cloudflared` binary is a separate Cloudflare component with its own
[license and terms](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/#legal).
