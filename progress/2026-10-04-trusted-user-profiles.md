# Trusted user profiles — 2026-10-04

Implemented the owner's trusted-user direction in one daemon. Settings can create
and select profiles; each profile has its own registered folders, approved roots,
workspace preferences, Focus order, report receipts, history and operational state.
Existing data remains in Owner. Profiles do not move project sources. Registration
rejects folders already owned by another profile, including overlapping source
trees, and native folder selection retains the requesting profile.

Pairing and device sessions remain central. Every paired device may select every
profile; passwords, roles, private access control and shared-project semantics are
outside this change. See [ADR-060](../docs/ADR-060-TRUSTED-USER-PROFILES.md),
[user guide](../docs/USER-GUIDE.md#choose-a-user) and
[CLI](../CLI.md#trusted-user-profiles).

HTTP/CLI selection and SSE route to the selected workspace. Browser tabs retain
their own selection, and commands retain the original profile, request ID, epoch
and payload through uncertain outcomes. Drafts and pending work block switching.
An unavailable remembered profile has an explicit return-to-Owner action that
keeps the paired session. Comments and new report drafts use the selected name.
The version-3 operational schema recovers interrupted profile creation; missing
published profile state fails visibly. Restore rotates every profile's epoch.

## Verification

- Full local gate passes: 494 tests (313 Rust, 174 Node, 7 Python), generated
  contracts/examples, schema and link validation, Svelte with zero errors/warnings,
  formatting, boundaries, bundle budget, strict Clippy and release build.
- Ten application profile tests cover independent workspaces, folder ownership,
  interrupted creation/retry, missing state and restore. Crash coverage includes
  real subprocess termination at prepared, initialized and committed boundaries.
  Transport and CLI tests cover selection, centralized authentication, SSE,
  command routing and the new registry protocol.
- Normally paired release Chromium suites `users`, `session`, `dialogs`,
  `protocol`, `comments`, `autosave` and `focus` pass. WebKit `users` and `protocol`
  pass. All seven user scenarios pass in both engines, including lost-ack replay,
  foreign-resource reads, author attribution, retained tabs, draft guards and
  unavailable-profile recovery. Final Chromium screenshots were inspected at
  320 px after animation completion; controls fit without horizontal overflow.
- Broad HTTPS smoke passes with an evidence-only copy of its runner that opens
  More for phone navigation. The original runner stopped at its old direct Board
  shortcut because concurrent navigation work moved that action into More. Its
  assertions and other workflows are unchanged in the adapted run.
- The final Focus recovery export includes its profile ID. Frontend checks/build
  were repeated after this small review correction, and the affected browser suites
  ran against the resulting embedded release build.

Environment: macOS arm64, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12 and
WebKit 26.6. Browser tests use temporary synthetic hosts with ordinary pairing.
This is automated browser/emulation coverage, not physical iPhone acceptance or
an access-isolation claim. Release acceptance remains open.

## Existing application

Rebuilt the frontend and release daemon, then restarted the existing manual
launcher at `https://100.122.250.14:47832` with the same data directory, ports,
connection settings and certificate. Trusted HTTPS verification preserves all
25 prior resource versions, one Focus pin, preferences, instance identity and
command epoch. All 32 served frontend files match the release build. The live
registry contains the existing Owner profile; synthetic test profiles were not
added to the owner's instance.

Concurrent navigation/UI changes are present in the tested working tree and
runtime but are excluded from this feature's commit, as is the owner's existing
card edit. Logs, screenshots, adapted smoke runner and before/after verification
are retained in ignored `test-results/trusted-users/`. A short project result is
submitted and read back through the explicitly selected local CLI project.
