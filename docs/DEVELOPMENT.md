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

## Release

Before tagging, update the package version and changelog together. Run all
checks above, inspect `npm pack --dry-run`, and manually test one real Quick
Tunnel. A `v<package version>` tag triggers `.github/workflows/release.yml`,
which rechecks the package and publishes to npm using GitHub OIDC and
provenance. The package name is `@usepeek/peek` and the repository is
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

Complete these steps only after the implementation and local gate have been
reviewed and approved. The canonical commit and the ancestor legacy commit
must both be reachable from `main`. Do not reuse a published version or move a
release tag.

1. Create or verify the npm organization `usepeek` and your permission to
   publish public packages in it. Sign in to npm locally with 2FA. Confirm
   `npm whoami` succeeds, `npm view @usepeek/peek version` finds no package,
   and the GitHub `Publish to npm` environment exists. Do not change repository
   credentials or store tokens in this repository.
2. From a clean checkout of the reviewed canonical commit, set only the
   package version to `0.2.2-beta.0` in a disposable worktree and run the full
   local gate. Publish this bootstrap version with
   `npm publish --tag bootstrap --access public`. The `bootstrap` tag prevents
   it from becoming the default `latest` release. Do not publish the final
   `0.2.2` version manually. npm requires the package to exist before its
   trusted publisher can be configured.
3. Configure the new package's trusted publisher from the authenticated npm
   account:

   ```sh
   npm trust github @usepeek/peek --repo radityama/peek --file release.yml --env 'Publish to npm' --allow-publish
   ```

   Verify the trust entry and the GitHub environment. npm does not validate
   the connection when it is saved, so check all fields before tagging.
4. After the reviewed canonical commit is on `main`, tag it `v0.2.2` and push
   the tag. The workflow must publish `@usepeek/peek@0.2.2`. Verify the package
   metadata, provenance, a clean install, `peek --version`, `peek doctor`, a
   normal preview, and cleanup after Ctrl+C. Stop if any check fails.
5. Configure a second trusted publisher for the old package with the same
   `radityama/peek`, `release.yml`, and `Publish to npm` identity:

   ```sh
   npm trust github @radityprtama/peek --repo radityama/peek --file release.yml --env 'Publish to npm' --allow-publish
   ```

   Tag the reviewed legacy ancestor commit `v0.2.2-legacy` and push it. The
   tag workflow checks the package identity and version before publishing.
   Verify `@radityprtama/peek@0.2.2` installs and shows its migration notice
   in an interactive preview. The old update checker still points at the old
   package so users of 0.2.1 can discover this final release.
6. Only after both packages work, deprecate the old name from an authenticated
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
