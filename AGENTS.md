# Agent guide for Peek

Peek is a zero-config Node.js CLI that runs one project's dev server and
shares its verified port through one temporary Cloudflare Quick Tunnel. It is
one npm package, `@usepeek/peek`, with `peek` as the executable. Read
[the architecture](docs/ARCHITECTURE.md), [design
spec](docs/superpowers/specs/2026-09-24-peek-v0.1.0-design.md), and
[decisions](docs/DECISIONS.md) before changing startup or security behavior.

## Directory map

| Directory | Purpose |
| --- | --- |
| `src/core` | Project discovery, command construction, process control, port detection, orchestration. |
| `src/cloudflared` | Pinned release mapping and verified binary cache. |
| `src/tunnel` | Provider contract and Cloudflare implementation. |
| `src/ui` | Terminal output and QR sizing. |
| `src/utils` | User-facing error model. |
| `tests/unit` | Pure parsers, mapping, and error tests. |
| `tests/integration` | Fake server/tunnel and CLI lifecycle tests. |
| `tests/fixtures` | Tiny projects and processes; do not install frameworks here. |
| `docs` | User, contributor, design, and decision documentation. |
| `.github/workflows` | CI and tag release automation. |

## Non-negotiable invariants

1. `peek` remains zero-config for a normal project with a `dev` script.
2. Peek must not require a Peek account.
3. Peek must not require a manually installed `cloudflared` binary.
4. Dev server and tunnel must always be cleaned up together.
5. Never expose a port other than the selected, verified server port.
6. Never collect source code or environment variables; add no telemetry.
7. Keep tunnel providers behind `src/tunnel/types.ts`.
8. Normal CI must not depend on an external Cloudflare tunnel.
9. Keep runtime dependencies minimal and explain any new one.
10. Preserve Node.js 22+ compatibility without requiring Bun.

Do not casually change the Cloudflare version or SHA-256 digests, disable
checksum checks, add shell execution, accept arbitrary public URLs, weaken
port ownership/readiness checks, or detach children from lifecycle cleanup.
Do not add accounts, relay infrastructure, configuration requirements, or
other roadmap ideas as part of unrelated fixes.

## Coding and verification

Use strict TypeScript, small modules, explicit types, and argv arrays. Keep
network and process boundaries injectable. Explain why in comments; avoid
comments that restate code. When working with a dependency API, check current
documentation with Context7 before relying on remembered behavior.

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm pack:check
```

Add a focused unit or integration test for behavior that can expose the wrong
port, lose a child process, accept a malformed URL, or execute an unverified
binary. No CI test should require the public Cloudflare network. Run the full
local gate before a release: lint, typecheck, test, build, and packed CLI smoke
test. See [development](docs/DEVELOPMENT.md) for manual tunnel testing.

## Release process

Update `CHANGELOG.md` and package version together. Verify every pinned
Cloudflare asset digest against the official release if changing the binary
version. Run the local gate and inspect `npm pack --dry-run`. The tag release
workflow checks the tag and package identity before publishing with npm
provenance. `@radityprtama/peek` has published versions through `0.2.1`;
`@usepeek/peek` is the canonical package from `0.2.2`. Never reuse a published
version within either package.
Verify that direct `npm publish` is authorized for the exact GitHub repository,
`release.yml`, and `Publish to npm` environment before tagging
`v<package version>`. The final legacy package uses `v0.2.2-legacy`; see
`docs/DEVELOPMENT.md` for the migration sequence. Never place an npm token in
this repository.
