# Deleted-project source diagnostics — 2026-10-03

Baseline: `abe908d`. The live host reported one `PROJECT_UNAVAILABLE` issue for
`technolog-cnc` after its deletion committed at 17:39:27 Europe/Warsaw. Its
registration and `.project/` were already removed; the separately registered
`technolog-cnc/rysunki` project has a different ID. No commands or jobs were pending.

The watcher retains a membership snapshot between two-second ticks. A delayed
filesystem notification passed a deleted ID to `refresh_project`, which treated
`PROJECT_NOT_REGISTERED` as an unavailable source and recreated its index issue.
A deterministic regression failed with exactly that diagnostic before the fix.

Refresh now checks current workspace membership under the existing read gate,
ordered with deletion/unregistration's write gate. An absent registration cleans
its disposable projection and reconciliation marker. Registered projects retain
ordinary source validation and unavailable-source diagnostics. No source schema,
protocol, durability, authorization or user data changes are introduced.

Verification:

- The full local gate passes 294 Rust, 172 JavaScript and seven Python tests
  (473 total), including formatting, clippy, contracts, documentation and release
  build. The first sandboxed run could not create CLI test sockets; the host-access
  rerun passes. All 16 focused deletion/recovery tests pass.
- The release Chromium deletion suite passes all 14 scenarios, including three
  seconds of diagnostic/Focus sampling after UI deletion. WebKit cannot start
  this existing suite because it requests unsupported `clipboard-write` permission;
  no WebKit deletion pass is claimed.
- Embedded frontend and release daemon are rebuilt and the existing manual app
  restarted at `https://100.122.250.14:47832`. Trusted HTTPS verifies all 32 served
  assets. Host/index are `ready`, with zero source issues, pending commands or jobs.
- All 22 remaining resource versions, one visible pin, preferences, certificate,
  instance and command epoch match the pre-restart snapshot. Two concurrent card
  deletions committed at 17:55:57 and 17:56:03 Europe/Warsaw before restart explain
  the snapshot's decrease from 24 resources; their original durable command
  results are retained in ignored verification evidence. They are not rollback
  or restart data loss.

Routine output is in ignored `test-results/source-diagnostics-2026-10-03/`.
Physical-device, platform and release acceptance remain open. No live project was
created or deleted for verification; destructive browser checks use synthetic data.
