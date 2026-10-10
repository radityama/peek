<p align="center">
  <img
    src="https://shieldcn.dev/header/grid.svg?title=peek&amp;subtitle=Run%20your%20dev%20server.%20Share%20it%20instantly.&amp;logo=false&amp;theme=zinc"
    alt="Peek — Run your dev server. Share it instantly."
    width="750"
  />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@usepeek/peek"><img src="https://shieldcn.dev/npm/@usepeek/peek.svg?variant=secondary&amp;size=sm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@usepeek/peek"><img src="https://shieldcn.dev/npm/dw/@usepeek/peek.svg?variant=outline&amp;size=sm" alt="npm weekly downloads" /></a>
  <a href="https://github.com/radityama/peek/releases"><img src="https://shieldcn.dev/github/radityama/peek/release.svg?variant=outline&amp;size=sm" alt="GitHub release" /></a>
  <a href="https://github.com/radityama/peek/stargazers"><img src="https://shieldcn.dev/github/radityama/peek/stars.svg?variant=outline&amp;size=sm" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://shieldcn.dev/github/radityama/peek/license.svg?variant=outline&amp;size=sm" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#sharing-modes">Sharing modes</a> ·
  <a href="docs/CLI.md">CLI reference</a> ·
  <a href="docs/ROADMAP.md">Roadmap</a>
</p>

---

**A public preview for your local dev server, in one command.**

Peek starts your project's development server, discovers its actual port, and opens a temporary HTTPS URL through [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

Built for remote machines, SSH sessions, cloud workspaces, and those moments when you just want to check a change on your phone. No Cloudflare account, manual `cloudflared` installation, or source-code upload required.

## Quick start

**Requirements:** Node.js 22 or newer, plus a project with a `dev` script in `package.json`.

Install Peek with your preferred package manager:

```bash
pnpm add -g @usepeek/peek
# or
npm install -g @usepeek/peek
```

Then run it inside your project:

```bash
cd my-project
peek
```

Peek detects your package manager, starts the dev server, verifies that it is reachable, and connects the tunnel.

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

Share the public URL or open the terminal QR code when your terminal supports it. **Press `Ctrl+C` to shut down the tunnel and dev server together.** The public hostname changes each time you start a new Quick Tunnel.

> [!IMPORTANT]
> Running `peek` creates a **publicly accessible** preview. Anyone who knows the URL can reach your dev server. Use [`peek --password`](#sharing-modes) for a password-protected preview, or `peek --private` to skip the public tunnel.

## Features

| Capability | What Peek does |
| --- | --- |
| **One-command setup** | Detects pnpm, npm, Yarn, or Bun and runs your project's `dev` script. |
| **Verified port discovery** | Finds a reachable dev server instead of blindly assuming `3000`. |
| **Instant HTTPS** | Uses a temporary Cloudflare Quick Tunnel URL without a Peek account. |
| **Built-in tunnel management** | Downloads and caches a pinned, checksum-verified `cloudflared` binary. |
| **Flexible sharing** | Public, password-protected, private, and LAN previews. |
| **Preview lifecycle** | Supports automatic expiry, tunnel reconnection, and coordinated cleanup. |
| **Terminal-first workflow** | Optional QR codes, actionable diagnostics, and `peek doctor`. |
| **Scriptable output** | Newline-delimited JSON events for automation and coding agents. |

Peek is intentionally small in scope: **run a development server and make it easy to preview**. It isn't a deployment platform or production reverse proxy.

## Sharing modes

Choose who can reach your preview:

| Mode | Command | Access |
| --- | --- | --- |
| Public (default) | `peek` | Anyone with the temporary HTTPS URL. |
| Password-protected | `peek --password` | HTTPS preview protected by HTTP Basic authentication at Peek's local proxy. |
| Private | `peek --private` | No public tunnel is created. |
| Local network | `peek --lan` | LAN URL and optional QR code; requires your dev server to be reachable from the LAN. |

For a short-lived review, combine password protection with an expiry:

```bash
peek --password --expires 30m
```

The password is requested interactively, without echoing it or placing it in shell history. In a browser, enter `peek` as the username and the password you chose. Expiry starts when the preview is first ready and shuts down the preview when the duration is reached (up to 24 hours).

> [!NOTE]
> Password protection is enforced by Peek's local proxy, not by Cloudflare before the tunnel. Cloudflare still transports the traffic. Protected previews also consume the `Authorization` header, so applications requiring their own `Authorization` header will not receive it through that protected preview. `--private` does not change your dev server's own network bind address. See the [security guide](docs/SECURITY.md).

## CLI essentials

| Command | What it does |
| --- | --- |
| `peek` | Run the detected `dev` script and start a public preview. |
| `peek --port 5173` | Require a specific port; fail if it was occupied before startup. |
| `peek -- npm start` | Launch an explicit executable and arguments, without a shell. |
| `peek --host-header localhost` | Work around dev servers that reject the tunnel hostname. |
| `peek --qr` / `peek --no-qr` | Request or suppress the terminal QR code. |
| `peek --expires 2h` | Stop the preview automatically. |
| `peek --json` | Emit newline-delimited JSON events instead of human-readable output. |
| `peek --verbose` | Include provider diagnostics and error details. |
| `peek doctor` | Inspect the local environment, cache, networking, and port discovery. |
| `peek doctor --live` | Start a temporary tunnel to test host handling and supported HMR checks. |

`peek dev` is an alias for `peek`. Pass Peek flags **before** `--`; anything after `--` is passed to the executable as arguments.

Explore the full [CLI reference](docs/CLI.md), [JSON event contract](docs/JSON.md), and [troubleshooting guide](docs/TROUBLESHOOTING.md).

### Optional configuration

Peek works without a config file in typical projects. If your server needs an explicit command or port, add `peek.config.ts` in the project root:

```ts
export default {
  command: ['pnpm', 'dev'],
  port: 5173,
  provider: 'cloudflare',
  qr: true,
}
```

CLI options take precedence over configured values. Peek executes the configured command as an argument array, not a shell string. Configuration is trusted project code. See [configuration details](docs/CLI.md#optional-project-configuration).

## Compatibility

Peek itself runs on **Node.js 22+**. Your app can use pnpm, npm, Yarn, or Bun. The managed tunnel engine supports:

| Platform | Architecture |
| --- | --- |
| Linux | x64, ARM64 |
| macOS | x64, ARM64 (Apple Silicon) |
| Windows | x64 |

Linux and macOS are the primary reliability targets. Peek downloads `cloudflared` on first use, checks its checksum, and reuses the cached binary afterward. A quiet server on an unusual port may need `--port`.

### Know the limits

- **Development only.** Cloudflare Quick Tunnels have no uptime guarantee, do not currently support Server-Sent Events, and limit concurrent proxied requests. See [Cloudflare's documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
- **Temporary URLs.** Quick Tunnel hostnames change between sessions; Peek does not provide stable hosted URLs or operate its own relay.
- **No hidden exposure.** Peek selects and verifies the server it tunnels. It does not turn your entire machine into a public network endpoint.
- **No telemetry.** Peek does not upload source code or collect usage telemetry. Interactive mode can check for package updates in the background; disable that with `NO_UPDATE_NOTIFIER=1`. Update checks are skipped in CI, test, and `--json` modes.

## Troubleshooting

If a preview doesn't start or your app rejects its hostname, run:

```bash
peek doctor
peek doctor --live
peek --verbose
```

For a blocked-host response, try `peek --host-header localhost`. For a server that doesn't print its port, pass `--port <number>`. The [troubleshooting guide](docs/TROUBLESHOOTING.md) covers additional scenarios, and [live verification notes](docs/LIVE-VERIFICATION.md) document tested tunnel behavior and environment limits.

## Updating from the old package

Peek is published as **[`@usepeek/peek`](https://www.npmjs.com/package/@usepeek/peek)**. If you installed the previous `@radityprtama/peek` package, uninstall it and install the new one:

```bash
npm uninstall -g @radityprtama/peek
npm install -g @usepeek/peek
```

For pnpm, use `pnpm remove -g @radityprtama/peek` and `pnpm add -g @usepeek/peek`.

## Contributing

Bug reports, focused feature requests, and pull requests are welcome.

- [Contributing guide](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)
- [Issues](https://github.com/radityama/peek/issues) · [Discussions](https://github.com/radityama/peek/discussions) · [Support](.github/SUPPORT.md)
- [Security policy](docs/SECURITY.md) · [Private vulnerability reporting](https://github.com/radityama/peek/security/advisories/new)
- [Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md) · [Development guide](docs/DEVELOPMENT.md)

For local development:

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## License

Peek is licensed under [MIT](LICENSE). The downloaded-on-demand `cloudflared` executable is a separate Cloudflare component governed by [its own terms](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/#legal).

---

<p align="center">
  <sub>Built for the moment when <code>localhost</code> isn't where you are.</sub>
</p>
