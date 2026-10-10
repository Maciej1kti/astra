# Repository review completion — 2026-10-05

The owner asked for everything the [first pass](2026-10-05-repository-review-fixes.md)
left open to be finished, apart from removing local test data. This record
covers the second pass, from `7809ddd` to the revision that contains it. Behavior
changes began with a regression that failed for the reviewed reason; refactors
were made under green tests.

## Server

- **Reviewed intents.** `projectctl recovery list` and `recovery abandon` settle
  a `needs_review` write by keeping the current source and rejecting the command
  ([ADR-067](../docs/ADR-067-REVIEWED-INTENT-RESOLUTION.md)).
- **Refused uploads.** The first pass answered an unauthenticated request without
  reading its body, which closed the connection under a proxy that was still
  uploading: 79% of 64 KiB and 90% of 900 KiB writes became an empty `503` or a
  reset. A refusal now releases admission and discards the body first; all 360
  probe writes receive `401`. At most 16 refusals drain at once, for 2 seconds.
- **Connections.** Both listeners cap open connections and close one without a
  complete request head; previously neither was bounded.
- **Definite refusals.** A stray or unacceptable file in a collection is
  `409 DOCUMENT_INVALID` instead of `503` while no intent exists.
- **Background work.** Receipts are removed with their report or project and
  swept for unregistered projects; watcher tasks are supervised; each profile
  retries its interrupted intents every 30 seconds; retention also runs shortly
  after start. An expired or stale plan is refused before any store is opened,
  and a relocation preview only reads.
- **Deletion lease.** Project deletion could fail with `EWOULDBLOCK` when a
  subprocess spawned on another thread still held the released lock; the lease is
  retried for a bounded number of attempts. It failed once in a full parallel run.
- **Structure.** The dispatcher is seven route functions with one structural
  check for local routes; the gate and store are taken through shared helpers;
  the remaining panic lints are enforced in every crate.

[ADR-068](../docs/ADR-068-HOST-BOUNDS-AND-BACKGROUND-RECOVERY.md) records these
decisions. Schemas and OpenAPI operations are unchanged; the local IPC contract
gains the two recovery routes.

## Browser

- **Accessibility.** The description is ordinary content with a separate labelled
  edit button; confirmations are groups or alert dialogs with only their message
  announced as an alert. A keyboard-only `accessibility` suite failed 0/5 before.
- **Recovery controls.** Settings and tag rename offer **Sprawdź stan**. A finished
  workflow's status carries no `result`; the browser now accepts that shape for
  workflow commands only instead of refusing the reply.
- **Presentation.** History shows dates and Polish field names, conflicts a
  labelled list; one coarse clock detects day rollover; shared buttons default to
  `type="button"`; the abandoned-recovery result has a Polish message.
- **Structure.** Board uses the shared read owner; civil dates and UUID checks
  have one owner each; `Editor.svelte` shrinks from 1,481 to 1,079 lines,
  `App.svelte` from 1,340 to about 1,120, `CalendarView.svelte` from 1,068 to 964
  and `workspace.css` from 1,118 to 822 with identical built CSS.
- **Checks.** ESLint with type-aware rules is part of the gate (364 findings
  resolved, 17 justified exceptions); `noImplicitReturns` and
  `noUncheckedIndexedAccess` are on. Unit tests grow from 287 to 448.
- **Bundle.** Initial JS/CSS is 79,914 bytes of the 81,920-byte budget.

## Tooling and repository

- A failed browser suite or gate step emits a workflow error annotation, so a red
  run names what failed without its log. This is how the two CI failures below
  were located.
- Workflow actions move to majors that target the current Node runtime, pinned by
  commit, and Rust dependency builds are cached.
- The second ADR-032 becomes ADR-032B; the package check skips tool worktrees.
- One clean, fully merged external worktree and its branch were removed.

## Remote CI

The first pass's push was red on both systems in the browser step. The cause on
Ubuntu was not isolated: the run after the refused-upload fix passed there, and
every later Ubuntu run that was assigned a runner has passed, through `6782543`.

The slower macOS runner then failed four runs, each on a different
timing assumption in a test rather than in the application, each located from
its annotation and fixed:

| Revision | Failed on macOS | Cause |
| --- | --- | --- |
| `728ceb5` | `focus` suite | A touch target measured right after a viewport change |
| `e13ac8c` | Gate, Rust tests | A lease regression bounded fifty short sleeps by wall-clock time |
| `12f26c0` | — (passed) | Ubuntu's job was cancelled by the service: no runner was assigned |
| `f9a06bf` | `editor` suite | A just-added chip measured while its entrance still scaled it |
| `6782543` | Gate, Rust tests | An admission test treated free permits as proof that every request had started |
| `250dc97` | — (passed) | Both systems green |

`250dc97`, which fixes the last of these, passed the whole workflow on both
systems. Changes after it are documentation only. The dependency
advisory scan, red before the first pass, is green. Eleven other suites assert a
44px target immediately after a layout change and may meet the same condition.

## Measured and not changed

- **Card creation.** With 1,000 cards on a loaded development host: 126.5 ms
  median and 147.3 ms p95 (40 creates), inside the 150 ms target. The remaining
  cost is validation of the whole collection and the recheck of every sibling's
  version. Referencing only the two neighbours would be faster but narrows a
  concurrency precondition for a benchmark result, so it was not done.
- **Saved workflow plans.** Their byte arrays are a tested compatibility
  contract and stay. Only the job status read changed: it takes its two fields in
  SQL instead of parsing every step.
- **Sustained slow uploads.** 300 callers restarting slow unauthenticated uploads
  every second for 40 seconds: all 190 local CLI calls succeeded (p95 17 ms) and
  185 of 188 asset requests were served (p95 36 ms); the other three were refused
  by the test proxy's own listener. Before the drain budget, no asset was served.
  A connection flood against the proxy itself is outside what the host controls.

## Left open

- `ChartDashboard.svelte` is not split: its sections share scoped rules, and
  separating them needs a pixel-verified change of its own.
- `exactOptionalPropertyTypes` stays off: 31 errors, mostly deliberate
  clear-by-`undefined` values that the option would force into the types.
- WebKit `responsive` fails on the unmodified `7809ddd` as well: the header
  profile picker is 23px tall at 320px on desktop WebKit. It needs a design
  decision and an iOS check.
- `card-layout` aims a held press with a measurement taken before the dialog
  finishes resizing; it failed about one run in ten under machine load and passes
  on reruns.
- An intermittent WebKit page error about access-control checks on a list read
  fails whichever suite is navigating; its unhandled path was not found.
- Pin admission still scans every registered project's cards under the exclusive
  gate, and the pairing rate limit is per instance; see
  [limitations](../docs/LIMITATIONS.md#source-and-state-bounds).
- A peer profile's receipt for a report deleted through another profile remains
  until that profile unregisters the project.
- Three small counter and confirmation behaviors found by new unit tests are
  recorded in the browser tests and not changed.
- About 28 GB of reproducible build copies under ignored `test-results/` remain
  by the owner's direction.

## Verification

```sh
.venv-check/bin/python scripts/check.py
ASTRA_TEST_PROFILE=release npm run test:browser
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs
```

- The gate passes all 16 steps on the integrated tree: 448 JavaScript, 9 Python
  and 389 Rust tests, contracts, boundaries, formatting, lint, the bundle budget,
  Clippy with warnings rejected and the release build. Two unit tests for the
  WebKit page-error filter were added afterwards (450).
- Chromium passes the CLI tag workflow, broad HTTPS smoke, planning checks and all
  40 regression suites.
- WebKit ran all 40 suites: 39 pass. `responsive` fails as it does on `7809ddd`.
  An earlier run also failed `focus`, `deletion` and `card-layout`; the first
  two were WebKit's console line for a read cancelled by a reload, now ignored
  by the shared runtime, and the third was the held-press aim, now steadied.
- At background CPU priority every Rust test passed without stopping at the
  first failure, after one wall-clock assertion was removed.
- One daemon lifecycle test timed out once while another build used every core
  and passed five reruns; `dialog-components` likewise timed out once under load
  and passed three reruns.

Logs are in ignored `test-results/review-fixes/`.

## Existing application rollout

The rebuilt embedded frontend and release daemon run at the existing
`https://100.122.250.14:47832` with the same launcher, data directory, connection
settings and certificate. Read-only snapshots before and after the restart are
identical: instance identity, command epoch, both profiles, 15 projects, all 44
resource versions, three pins, preferences, roots and both certificate files.
All 65 served assets match the local build over the existing certificate, the
CSP header is present, an unauthenticated bootstrap returns `401`, `doctor`
reports no warnings for either profile and `recovery list` is empty.

A browser paired through the normal challenge and CLI approval visited all
eight views at 1440px and Focus at 390px: no alert, page error, server error or
write request. Its session was revoked afterwards. The owner's resolution of the
`needs_review` decision report and an earlier card edit are left as the owner's
changes outside these commits. The
[project result](https://github.com/Maciej1kti/astra/blob/498b3a1eac6acabe399e0c49fb8849da24cf6350/.project/updates/d6b01b61-8157-41a9-9463-15c3deb8969e.json)
was appended through the selected CLI project and read back.

## Limits

Server and browser changes were verified by regressions, the gate and the browser
suites on synthetic hosts. The new accept path ran behind the test proxy, not a
production proxy or near descriptor exhaustion. Performance figures come from one
loaded development host. Browser emulation and macOS WebKit are not physical
iPhone acceptance; physical-device and full release acceptance remain open, and
no card acceptance, priority or deadline is changed.
