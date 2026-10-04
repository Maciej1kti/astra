# Shared exercise project and profile names — 2026-10-04

Implemented conditional profile renaming and shared project registration following
the owner's request. The initial profile is now Maciek, with all 15 prior project
registrations retained. Tomek has the existing `cwiczenia` project registered
against the same source folder. The Pompki card contains one Pompki counter, unit
`rep`, step 1, with no recorded repetitions fabricated during setup.

Sharing uses one host gate and pooled project-store lease/mutex. Each profile keeps
its own journal, workspace, receipts and history. An unresolved source operation
in either journal blocks competing writes, including after restart. Source pin
admission checks each affected workspace; deletion/relocation require other
profiles to unregister first. Profile names and committed rename outcomes share
one root SQLite transaction. See [ADR-061](../docs/ADR-061-SHARED-PROFILE-PROJECTS.md),
[user guide](../docs/USER-GUIDE.md#choose-a-user) and
[CLI](../CLI.md#trusted-user-profiles).

## Verification

- Full local gate passes: 510 tests (328 Rust, 175 Node, 7 Python), generated
  contracts, examples, schema/link checks, Svelte with zero errors/warnings,
  formatting, boundaries, bundle budget, strict Clippy and release build.
- All 24 application user tests and 33 daemon tests pass. New coverage includes
  shared counter/version/conflict/replay, one lease across restart/unregister,
  pending peer source/workflow barriers, unresolved child recovery, Focus limits
  and stale deletion/relocation plans. Hard process-exit tests exercise both
  journals at six source write boundaries; rename has atomicity/retry tests.
- An equivalent lexical folder path could falsely require review after the first
  profile unregistered. Its regression failed before the fix; recovery now compares
  paths without resolving symlinks or weakening descriptor/lease validation.
- Normally paired release Chromium and WebKit pass all five `shared-users`
  scenarios and all seven existing `users` scenarios. Both profiles read one
  source/card version; the second profile records exactly one counter step, the
  first sees it, a stale write is rejected, and an open peer view updates through
  SSE without reload. The 320px counter screenshot was inspected.
- Release Chromium counter regressions and the maintained broad HTTPS smoke pass.
  The existing narrow header picker-width limitation remains tracked in the
  [navigation evidence](2026-10-04-compact-navigation.md); this is not a claim that
  the full responsive suite or physical iPhone acceptance passed.

Environment: macOS arm64, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12 and
WebKit 26.6. Synthetic browser hosts use ordinary pairing. Logs, screenshots and
command identities are in ignored `test-results/shared-users/`.

## Existing application

Rebuilt the embedded frontend/release daemon and restarted the existing manual
app at `https://100.122.250.14:47832`, preserving data, ports and certificate.
Before/after verification preserves all 28 prior resource versions, one Focus
pin, preferences, instance identity and command epoch; all 32 served assets match.

The live folder-sharing plan reported no source-file changes and only added
Tomek's workspace registration. Creation, rename, registration and counter setup
used ordinary CLI commands with observed versions and readback. A second restart
verifies durable names, unchanged registry version, Maciek's 15 projects, Tomek's
one project, identical Pompki source versions/counter IDs and empty recorded values.
Both profiles report zero pending commands and zero source issues. A short result
is submitted and read back through the explicitly selected Astra CLI project.

The owner's existing Astra card edit remains outside this change. Shared values
are common to both profiles; separate per-person counter totals, private access
control and full release acceptance are not introduced by this result.
