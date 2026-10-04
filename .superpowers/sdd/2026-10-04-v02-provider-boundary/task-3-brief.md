### Task 3: Ownership documentation and delivery evidence

**Files:** Modify `docs/ARCHITECTURE.md` and this plan. Store gate logs in
`/tmp/peek-v02-hardening-records/phase4/`, outside tracked source.

- [x] **Step 1: Update the authoritative architecture map.**

In the Modules table replace the src/tunnel wildcard row with:

```md
| `src/tunnel/types.ts` | Local target, session/liveness and provider cleanup contract. |
| `src/tunnel/prepare.ts` | Prepare the verified managed Cloudflare provider; CLI composition consumes this factory. |
| `src/tunnel/cloudflare.ts` | Validate the loopback HTTP origin, start the transport, parse its public URL and confirm process shutdown. |
```

Replace execution lifecycle item 2 with:

```md
2. In public mode, the tunnel preparation factory verifies or downloads the
   pinned `cloudflared` binary before starting the dev server. Register the
   prepared provider for cleanup. LAN mode skips the tunnel engine.
```

Replace the final provider paragraph with this complete section:

````md
### Provider and session boundary

```text
CLI composition
    -> tunnel preparation factory
    -> Lifecycle / runPeek
    -> TunnelProvider.connect({ target: URL, signal })
    -> TunnelSession { url: string, exited: Promise<TunnelExit> }
```

The CLI selects options and output. `src/tunnel/prepare.ts` owns concrete
Cloudflare construction and the verified binary dependency. Core orchestration
passes the selected, verified `http://127.0.0.1:<port>/` target; local display
URLs retain their existing localhost form. Cloudflare accepts root HTTP targets
on that numeric loopback address with a valid port and without credentials,
query or fragment. It rejects other origins before launching a process.

A `TunnelSession` reports the transport's public URL and termination. The
provider retains `disconnect()` and optional `forceDisconnect()` because
cleanup must also work when startup has not returned a session. `Lifecycle`
registers the provider before dev startup; `runPeek` disconnects before every
connect attempt. Reconnection preserves the dev process and verified target.
The session does not own the dev server or decide retry timing.

Cloudflare output parsing, process flags and config diagnostics stay inside
the tunnel implementation. Host-header compatibility remains the explicit
localhost override. Authentication, expiry and inspection are absent from
the transport contract. Doctor may inspect the managed engine as a diagnostic.

The future local proxy will enter after `server-ready` and before tunnel
connection. Its verified loopback listener becomes the provider target while
the dev URL remains the application target. Proxy readiness, ownership and
shutdown order must be integrated into the lifecycle when implemented. The
CLI and provider transport need no proxy authentication knowledge. Peek
currently has no local proxy.
````

Keep current retry, JSON, signal, error and cleanup descriptions unchanged.
No other document duplicates this ownership section.

- [x] **Step 2: Run the six local gates sequentially and inspect the artifact.**

Run these commands individually, recording exit status and full output in
task3-lint.log, task3-typecheck.log, task3-test.log, task3-build.log,
task3-pack-check.log and task3-smoke-pack.log under the record directory:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
pnpm smoke:pack
```

Expect each exit 0; tests include the new target and generic-provider cases.
The existing local LAN skip and upstream tool warning/hint remain disclosed.
Inspect pack output for 0.2.2 and no fixtures/new exports/dependencies.
Installed smoke must pass help/version/config export; this is not packed
preview or public-tunnel dogfooding. Those remain later project gates.

- [x] **Step 3: Self-review and commit documentation.**

Run `git diff --check` and inspect source/lockfile/package status. Check the
new prose against actual types, guard, CLI imports and tests. Mark this task
complete and commit docs/ARCHITECTURE.md and this plan with
`docs: map tunnel target and session ownership`. Report exact gate results,
artifact contents, platform limitations, warnings and commit in the report.

## Controller delivery checklist

- [ ] Resolve every task-review finding and cross-task verification item.
- [ ] Run one whole-branch review at main base 8b19cef; one combined fix wave
  and scoped re-review if it finds issues.
- [ ] Run the primary antislop gate on source, prose and PR description.
- [ ] Update draft PR #13's description with implementation/evidence/risks.
- [ ] Push the reviewed branch, inspect all six required CI jobs at its exact
  head, and fix failures on this branch. Mark ready only after healthy review/CI.
- [ ] Merge through the established gh workflow; update clean local main with
  ff-only and inspect post-merge CI before beginning another phase.
- [ ] Preserve the exhaustive rulings and costs, archive this plan's scratch
  records outside the repository, and remove only its owned scratch workspace.
- [ ] Keep version 0.2.2 and record provider phase status; the wider project
  and v0.2.3 decision remain incomplete.
