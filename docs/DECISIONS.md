# Decisions

These lightweight records explain choices made across v0.1 and v0.2. Revisit them when
evidence changes, while preserving the product and security invariants in
`AGENTS.md`.

## 1. Node.js runtime instead of Bun

**Decision:** Peek requires Node.js 22 or later. It can launch Bun for a Bun
project, but Peek itself does not require Bun.

**Why:** Node.js is available in the remote and cloud development environments
this CLI targets, and npm-compatible global installation is straightforward.
Choosing Bun as Peek's runtime would impose an extra installation on users.

## 2. TypeScript source, bundled ESM CLI

**Decision:** Source uses strict TypeScript and tsdown builds one Node ESM
entrypoint with a shebang.

**Why:** The port, process, and provider boundaries benefit from explicit
types. A single package and executable keep installation simple. The published
tarball includes the built CLI and runtime dependencies.

## 3. Cloudflare Quick Tunnel for v0.1

**Decision:** Cloudflare Quick Tunnel is the sole functional provider.

**Why:** It creates a temporary HTTPS URL without a Peek account or a domain.
Peek is a developer-experience wrapper over existing tunnel infrastructure.
Cloudflare states that Quick Tunnels are for testing and development, with no
uptime guarantee and specific traffic limitations; Peek documents those
limits rather than making stronger claims.

## 4. No Peek relay yet

**Decision:** Peek does not implement a relay server, domain service, or
account system in v0.1.

**Why:** Those systems would add persistent infrastructure, security operations,
cost, and product surface before the core CLI experience is proven. The
provider interface leaves a narrow seam for a future decision.

## 5. One repository and package

**Decision:** Peek is not a monorepo.

**Why:** There is one CLI and no server, UI application, or shared package.
A monorepo would add tooling and release complexity without a current boundary
to support.

## 6. Verified port detection

**Decision:** `--port` wins. Otherwise Peek parses local dev output, checks
loopback reachability, inspects child listeners when available, and considers
only common ports newly opened after startup. Ambiguity fails with a `--port`
remedy. A preoccupied explicit port is rejected.

**Why:** Framework logs vary, and a default port can belong to another
service. A successful TCP connection alone is insufficient evidence when the
port was occupied before Peek started. Silent servers on arbitrary ports may
need explicit help; this is preferable to exposing the wrong local service.
The tool detects a *used* port, so `get-port` would not solve this problem.

## 7. Managed, pinned `cloudflared` distribution

**Decision:** Peek downloads official `cloudflared` `2026.9.1` assets over
HTTPS, verifies fixed SHA-256 digests, and caches an executable under
`~/.peek/bin`. It does not rely on a system `cloudflared` or download every
run. macOS archives and extracted executables have separate pinned hashes.

**Why:** Requiring a manual install breaks the main zero-config promise.
Bundling every platform's binary in the npm package would make each install
large. A fixed release plus digest verification limits supply-chain ambiguity;
the user-level cache keeps later starts fast. The release body lists macOS
executable digests, while GitHub asset metadata lists the `.tgz` digests.

## 8. Tokenized explicit command

**Decision:** `peek -- pnpm dev` is the explicit-command form. A quoted
`peek run "pnpm dev"` form is not shipped.

**Why:** Tokens after `--` map directly to an executable and arguments through
Execa. A string form would require shell-style parsing or shell execution,
which adds ambiguity and injection risk.

## 9. Windows command availability

**Decision:** On Windows, an early failed dev process is checked with
`which-command` before calling it a missing package manager or executable.

**Why:** Execa can use `cmd.exe` to launch Windows commands. An unresolved
command may therefore exit with code 1, just like a dev server that crashed.
`which-command` is the same small resolver Execa uses internally and handles
Windows `PATHEXT`. The check runs only after a failed startup, so normal starts
do not pay for it.

## 10. Optional TypeScript configuration in v0.2

**Decision:** A project may provide `peek.config.ts`, but a plain `peek` still
works without it. Commands in config are argv arrays. Peek uses `jiti` to load
the file, then validates every supported setting before startup.

**Why:** Node 22.0 cannot execute TypeScript files natively, while Peek promises
Node 22+ compatibility. `jiti` is a small, zero-dependency runtime package and
is called only when a config file exists. The config is trusted local project
code; Peek does not evaluate strings as shell commands.

## 11. Reconnect without restarting the dev server

**Decision:** A dropped Quick Tunnel triggers retries with capped, abortable backoff
while the verified dev server stays alive. A new tunnel URL replaces the old
one. Ctrl+C and a dev-server exit still stop the entire lifecycle.

**Why:** Restarting a dev server can change its port and process tree. Keeping
it alive preserves the selected service and makes temporary network failures
recoverable without weakening port verification.
