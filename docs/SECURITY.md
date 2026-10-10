# Security

**A plain Peek public URL exposes the selected local service to anyone who has
the URL while the tunnel runs.** The randomly generated hostname is not an
access control system. `peek --password` adds HTTP Basic authentication in
Peek's local proxy. Use a strong password and keep the application itself
protected when it contains sensitive data or unsafe development endpoints.

## Threat model and scope

Peek runs one user-selected dev command and one Cloudflare Quick Tunnel as the
current user in public and protected modes. The tunnel origin is a Peek proxy
bound to `127.0.0.1` on an ephemeral port. That proxy forwards to exactly the
selected, verified dev port and checks its ownership before tunnel connection.
The proxy shares one inspection among concurrent requests and reuses a
successful result for at most one second. Process exit and shutdown stop
forwarding even if that result was cached. If verification fails, the proxy
responds with 502. A listener can still change during the one-second window
or immediately after a check; this is a local timing limit. Peek
rejects an explicit port occupied before startup. It does not expose a range
of ports, a filesystem directory, or an arbitrary network interface. If the
selected app exposes secrets or source files through HTTP, remote visitors
with access can request them. Peek cannot secure the app's routes.

Protected mode prompts for a password on an interactive terminal without
echoing or writing it to config. The browser uses user name `peek` and the
password over the tunnel's HTTPS URL. The proxy checks the credential on every
HTTP and WebSocket request with a fixed-length digest comparison and removes
Peek's `Authorization` header before forwarding. An app that needs its own
`Authorization` header cannot use that header through a protected preview.
The password prompt accepts at most 1024 UTF-8 bytes. Malformed Basic
credentials are rejected. Peek permits a burst of 12 failed authentication
attempts, then refills one attempt every five seconds. This limit is shared
by the proxy because `cloudflared` connects locally and forwarded client-IP
headers are not trusted. Correct credentials still work while guesses are
throttled; the policy slows rapid guessing but cannot stop a determined
attacker. The proxy allows at most 128 simultaneous local connections, 100
headers per request, and ten seconds to complete request headers. These limits
bound local resource use but cannot guarantee availability under attack. Use a
strong password.

For protected browser WebSockets, Peek requires the `Origin` header to match
the active public preview URL. It rejects malformed, cross-site, and stale
origins after reconnect. Clients without an `Origin` header can connect with
the correct password; `Origin` is a browser protection, not an identity check.
HTTP Basic credentials may not be sent by every browser or framework HMR
client on a WebSocket handshake. If HMR does not authenticate, use an
unprotected preview only for content safe to share, or test through local
access. This browser behavior still needs live Cloudflare validation.

The dev server's direct port remains reachable locally and may be reachable
on the LAN if the dev command binds an external interface; Peek's password
does not protect direct access to that port. Cloudflare terminates the public
HTTPS connection and can inspect traffic it carries. `--private` starts no
public tunnel but does not force the dev server to bind loopback. `--lan`
intentionally advertises a local-network URL. `--expires` starts at first
readiness and requests coordinated cleanup when its deadline arrives.
The duration uses an elapsed-time timer and does not reset after a tunnel
reconnect. The displayed UTC `expiresAt` is calculated from the wall clock at
first readiness, so a later clock adjustment can make that label differ from
the remaining elapsed time.

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
