# Development

Peek is one Node.js package. Node.js 22+ and pnpm 11.20.0 are used for local
development. Enable pnpm with Corepack if it is not already available.

```sh
git clone https://github.com/radityprtama/peek.git
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

`src/cli.ts` parses arguments and presents errors. `src/core` discovers the
project, runs the dev process, detects and verifies its port, and owns process
cleanup. `src/cloudflared` downloads and verifies the pinned binary. `src/tunnel`
contains the provider contract and Cloudflare implementation. `src/ui` formats
terminal output. `tests/unit` covers parsers and decisions; `tests/integration`
uses tiny fake server and tunnel processes to test readiness and lifecycle.
See [architecture](ARCHITECTURE.md) and [decisions](DECISIONS.md) for details.

## Try the CLI locally

After `pnpm build`, run `node dist/cli.js --help`. To expose the local CLI as
`peek` on your PATH, run `npm link` from the repository, then `peek --version`.
Remove the link with `npm uninstall -g @radityprtama/peek` when finished. pnpm
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

## Release

Before tagging, update the package version and changelog together. Run all
checks above, inspect `npm pack --dry-run`, and manually test one real Quick
Tunnel. The `v<package version>` tag triggers
`.github/workflows/release.yml`, which rechecks the package and publishes to
npm with provenance using GitHub OIDC. The package name is
`@radityprtama/peek` and the intended repository is
`radityprtama/peek`.

`0.1.0` and `0.1.1` are already published under this package name. npm will
not replace a published version. Confirm that the version in `package.json`
matches the tag and is absent from the registry before pushing it.

Peek v0.2 uses `jiti` as its only new runtime dependency because Node 22.0
cannot load TypeScript configuration files by itself. The optional config file
is the only path that calls the loader.

Configure the npm trusted publisher for owner `radityprtama`, repository
`peek`, workflow filename `release.yml`, environment `Publish to npm`, and
**allow direct `npm publish`**. The environment must match the release job's
`environment` field exactly.
The CLI equivalent, using npm 11.15.0+ from an authenticated account with 2FA,
is:

```sh
npm trust github @radityprtama/peek --repo radityprtama/peek --file release.yml --env 'Publish to npm' --allow-publish
```

The GitHub repository must be public for npm provenance. Verify the trust
entry before pushing a release tag. See [npm's trusted publisher
instructions](https://docs.npmjs.com/trusted-publishers/) and the
[npm trust command](https://docs.npmjs.com/cli/v11/commands/npm-trust).
Do not store an npm token in GitHub Actions.

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
