# Security

**A Peek public URL exposes the selected local service to anyone who has the
URL for as long as the tunnel is running.** Peek v0.1 does not provide
application-level authentication. The randomly generated hostname is not an
access control system. Protect the application itself before exposing private
data or dangerous development endpoints.

## Threat model and scope

Peek runs one user-selected dev command and one Cloudflare Quick Tunnel as the
current user. The tunnel origin is exactly `http://127.0.0.1:<selected port>`.
Peek verifies the port is reachable and rejects an explicit port occupied
before startup. It does not expose a range of ports, a filesystem directory,
or an arbitrary network interface. If the selected application itself exposes
secrets or source files through HTTP, remote visitors can request them through
the tunnel. Peek cannot inspect or secure the application's routes.

Cloudflare carries public HTTP traffic for the tunnel. Read [Cloudflare's
Quick Tunnel documentation and terms](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
before using it with sensitive traffic. Quick Tunnels are intended for testing
and development, have no uptime guarantee, and currently do not support
Server-Sent Events.

## Binary trust

Peek pins `cloudflared` `2026.9.1`. On first use it downloads a fixed asset
from the official [Cloudflare GitHub
release](https://github.com/cloudflare/cloudflared/releases/tag/2026.9.1)
over HTTPS, applies a download size and time limit, and checks the asset's
SHA-256 digest. On macOS it verifies the `.tgz` before extracting only the
`cloudflared` member and verifies the extracted executable digest as well.
Cached executables are rehashed on every run. Failed or interrupted downloads
do not become executable cache entries.

The cache is `~/.peek/bin/<platform>-<arch>/cloudflared-2026.9.1` (plus
`.exe` on Windows). Remove `~/.peek/bin` to force a fresh verified download.
Peek's MIT license does not replace Cloudflare's license and terms for the
downloaded binary. The checksum ties execution to the pinned release asset;
it does not independently audit Cloudflare's code or build process.

## Command and data handling

Peek passes executable and argument arrays to Execa with shell execution
disabled. This avoids shell interpretation of arguments after `--`; users
still control which executable they choose to run. Peek reads the current
directory's `package.json` and known lockfile names for discovery. It does not
read unrelated project files, upload source code, collect telemetry, or log
environment variables. Dev-server stdout and stderr are displayed, so the
application may itself print sensitive values; check its logs before sharing
terminal output.

Signal handling stops the tunnel before the dev process tree. Abrupt process
termination by the OS, power loss, or `SIGKILL` cannot run normal cleanup.
If a process remains after such an event, stop it with the system process
manager.

## Reporting vulnerabilities

Use the repository's [private GitHub vulnerability reporting
channel](https://github.com/radityama/peek/security/advisories/new). Do not
post exploit details in a public issue or discussion. Include the Peek version,
platform, impact, and reproduction steps without sharing real secrets.
