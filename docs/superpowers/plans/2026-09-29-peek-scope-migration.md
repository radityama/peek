# Peek scope migration implementation plan

> **For agentic workers:** Execute this plan inline, task by task. Steps use checkboxes for tracking.

**Goal:** Prepare the final legacy `0.2.2` migration release and canonical `@usepeek/peek@0.2.2` without publishing either.

**Architecture:** Keep one CLI and one repository. Place the legacy release in an ancestor commit with a distinct tag pattern, then change the package scope in a later canonical commit. Extend existing doctor checks. Preserve the current provider seam unless tests expose a concrete coupling defect.

**Tech Stack:** Node.js 22+, strict TypeScript, pnpm, Vitest, Biome, tsdown, GitHub Actions, npm OIDC.

---

## File map

- `src/cli.ts`, `src/ui/output.ts`, `src/update/*`: terminal migration notice and update behavior.
- `tests/unit/update-*.test.ts`, `tests/integration/cli.test.ts`: notice and output contract.
- `src/core/doctor.ts`, `tests/unit/doctor.test.ts`: diagnostic facts and remedies.
- `src/cloudflared/binary.ts`, `src/tunnel/*`, `src/core/*`: targeted reliability fixes only.
- `.github/workflows/release.yml`: distinguish the legacy tag from the canonical tag without loosening the version check.
- `package.json`, `scripts/smoke-pack.mjs`, docs, and current tests: canonical package name and GitHub URL.
- `docs/DEVELOPMENT.md`: exact manual publishing sequence and stop conditions.

## Task 1: Legacy release

- [ ] Add a focused test that spawns or invokes the CLI with an interactive terminal after preview readiness, expects one migration message, and expects none for JSON, doctor, CI, tests, or piped output.
- [ ] Run the focused test and confirm failure before implementing the notice.
- [ ] Add one terminal-only notice after the first preview URL. Keep the old package registry lookup and existing update cache behavior.
- [ ] Run the focused and existing update tests.
- [ ] Set the legacy package version to `0.2.2`, update `CHANGELOG.md`, and update its GitHub metadata to `radityama/peek` for OIDC identity.
- [ ] Adjust the tag workflow so `legacy-v0.2.2` can publish only the legacy package at version `0.2.2`; keep `v<version>` for the canonical release. Verify both cases without pushing tags.
- [ ] Commit this state and record the commit SHA. Do not create a tag.

## Task 2: Doctor and focused reliability

- [ ] Add tests asserting doctor reports Peek and cloudflared versions, platform and architecture, project manager evidence, actionable warnings, and safe output in normal and verbose modes.
- [ ] Run the focused doctor tests and confirm the missing checks fail.
- [ ] Extend `runDoctor` and its existing CLI presentation without adding a second doctor command or changing preview output.
- [ ] Check process, signal, tunnel startup, timeout, download, and port tests for an actual failure. Add a regression test before each targeted fix; do not refactor working code for symmetry.
- [ ] Run the focused doctor and reliability tests after each fix.

## Task 3: Canonical package

- [ ] Change `package.json` to `@usepeek/peek@0.2.2` and `radityama/peek`, then update the lockfile as needed.
- [ ] Point the update checker and terminal update command at the new package. Update their tests with the exact new registry endpoint and install command.
- [ ] Update packed-package smoke checks to locate `node_modules/@usepeek/peek` and load its `/config` export.
- [ ] Update current README, CONTRIBUTING, AGENTS, `.github` support links, and docs. Preserve historical release specs and plans as history.
- [ ] Remove the legacy migration notice from the canonical CLI while preserving its previous interactive behavior.
- [ ] Add a documentation section for `0.2.2-beta.0` bootstrap publication under the `bootstrap` tag, npm trust, GitHub environment, canonical tag, install verification, and subsequent deprecation.

## Task 4: Verification and handoff

- [ ] Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm pack:check`, and `pnpm smoke:pack`.
- [ ] Install the generated tarball into a temporary clean directory, confirm the CLI version, help, config export, doctor output, fake tunnel startup and cleanup, and the update-check target.
- [ ] Inspect `npm pack --dry-run`, the final diff, all nonhistorical `radityprtama` references, and the release workflow tag checks.
- [ ] Report the legacy commit SHA, canonical commit SHA, test results, risks, and manual npm/GitHub steps. Stop before tagging, publishing, or deprecating.
