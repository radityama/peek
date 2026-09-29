# Contributing to Peek

Thanks for helping improve Peek. Bug reports, documentation fixes, tests, and
focused pull requests are welcome. Follow the [Code of Conduct](CODE_OF_CONDUCT.md)
in project spaces.

## Before you start

- Search [issues](https://github.com/radityama/peek/issues) and existing pull
  requests for related work.
- Use a [GitHub Discussion](https://github.com/radityama/peek/discussions)
  for usage questions or an early design conversation. Open a feature request
  issue when you can describe the change and why it belongs in Peek.
- Read the [roadmap](docs/ROADMAP.md) and [decisions](docs/DECISIONS.md) before
  proposing a major change. Roadmap items are ideas, not commitments.
- Report security vulnerabilities through [private vulnerability
  reporting](https://github.com/radityama/peek/security/advisories/new),
  following the [security guide](docs/SECURITY.md). Do not publish exploit
  details in an issue or discussion.

## Develop locally

Peek needs Node.js 22 or newer and pnpm 11.20.0. See the
[development guide](docs/DEVELOPMENT.md) for setup and the full verification
commands.

```sh
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Keep changes small and focused. Add a test when behavior could expose the
wrong port, leave a child process running, accept a malformed public URL, or
execute an unverified binary. Integration tests must use fake processes and
must not require a public Cloudflare tunnel. Preserve Node.js 22 compatibility.

## Submit a pull request

1. Fork the repository and create a branch from `main`.
2. Make the change, update relevant documentation, and run the checks above.
3. Open a pull request with the reason for the change, a short summary, and
   the checks you ran. Link a related issue when one exists.
4. Respond to review comments and keep the branch current when requested.

The maintainer reviews contributions for fit with Peek's zero-config model,
security boundaries, and test coverage. A pull request may need changes before
it can be merged. By submitting a contribution, you agree that it is licensed
under Peek's [MIT license](LICENSE).
