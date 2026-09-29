# Peek npm scope migration design

Date: 2026-09-29
Status: approved in conversation, including v0.2.2 additions

## Release boundary

Peek remains the same CLI and Cloudflare remains its only public tunnel provider. The repository is `radityama/peek`. The npm package `@radityprtama/peek@0.2.2` is the final migration release. `@usepeek/peek@0.2.2` is the canonical release. Both names can use the same version because npm treats them as separate packages; they require separate Git commits and tags.

The legacy commit stays in the canonical branch history so it can be tagged `legacy-v0.2.2` after final approval. The canonical commit is tagged `v0.2.2` after a bootstrap publication establishes the new package and its trusted publisher is configured. No tag or publish occurs during implementation.

## Legacy user path

The legacy package keeps its existing update check against `@radityprtama/peek`. Users on 0.2.1 or earlier can see 0.2.2 as the next update. Version 0.2.2 shows one migration notice during an interactive preview, after a URL appears, with a command to install `@usepeek/peek`. It does not alter JSON output, CI, test, doctor, help, version, or non-interactive runs. The old package is deprecated only after the canonical package is installed and verified from npm.

The notice is informational. Peek neither installs another package nor automatically removes the legacy package. Its development server, tunnel, port checks, and cleanup remain unchanged.

## Canonical package

The canonical commit changes package metadata, install and update instructions, registry lookup, packed-package checks, current docs, and links to `radityama/peek`. Historical design and plan records retain their original package names as records of shipped work. The executable remains `peek`, and its command syntax and output contract stay the same.

The first `@usepeek/peek` publication is a `0.2.2-beta.0` bootstrap under the `bootstrap` dist-tag, created from a clean checkout of the reviewed canonical commit. It is not the default `latest` release. The npm organization must already exist and the publisher must have write access. npm requires a package to exist before configuring `npm trust github`. After bootstrap, configure trust for `radityama/peek`, `release.yml`, environment `Publish to npm`, and direct publishing. The reviewed `v0.2.2` tag then publishes the final version with GitHub OIDC and provenance. A failure in any step stops the sequence; no deprecation occurs until the new package is verified.

## Doctor and reliability

`peek doctor` already performs Node, config, command, cloudflared cache, network, and port-inspection checks. It gains the installed Peek version, operating system and architecture, detected project and package manager, and the pinned cloudflared version. Every failure or warning has a concrete remedy. `--verbose` can show safe diagnostic facts such as check names and versions, but never environment values, project source, or credentials. Default doctor output remains readable text; JSON doctor output remains structured.

Reliability changes are limited to defects found through existing and focused tests. The current `TunnelProvider` interface already contains the provider boundary. It will remain until a concrete coupling problem warrants a `TunnelSession` split. No new provider, account, relay, stable URL, or dashboard is introduced.

## Verification

Focused tests cover legacy notice eligibility and timing, unchanged JSON and non-interactive output, doctor fields and remedies, and any concrete reliability fix. The full local gate is lint, typecheck, unit and integration tests, build, pack dry-run, packed CLI smoke test, and a clean install from the local tarball. A fake tunnel verifies normal flow and cleanup without depending on Cloudflare. A real Cloudflare smoke test may be run manually but is not a CI requirement.
