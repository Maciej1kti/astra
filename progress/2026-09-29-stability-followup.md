# Stability follow-up — 2026-09-29

Owner direction: investigate the isolated crash-test failure, add automatic
dependency advisory checks in CI, then inspect and simplify the editor where a
cohesive boundary helps. Explain older API compatibility before any retirement.
Baseline: `4d13816`; the earlier three-pass audit remains closed.

## Checkpoint

- [x] Run a bounded diagnostic series with captured crash-child output; fix only
  a reproduced cause. Keep an unexplained failure explicit if it does not recur.
- [x] Add scheduled and lockfile-change advisory checks for npm, Cargo and Python,
  preserving pinned dependencies and treating service failure as an incomplete scan.
- [x] Inspect `Editor.svelte`, extract a concrete responsibility when useful,
  and verify draft, command identity, conflict and session behavior.
- [x] Explain workspace tag vocabulary versus current project tag management,
  and milestone compatibility; retain both unless the owner decides otherwise.
- [x] Full gate, appropriate release browser checks, reports, commits/pushes.
  Rebuild/restart the existing manual app after application changes and verify HTTPS.

Current checkpoint: completed. Diagnostics/advisory report:
`deaaa64c-ad79-4150-8c3e-dfc781bc6a3c`; editor/verification report:
`45363f80-4c35-40f8-822f-e9e957d22dd6`. The manual app is rebuilt, restarted and
HTTPS-verified with existing state preserved. The original crash failure did not
recur and remains unexplained. Two pre-existing owner card edits (`2fec9ea1…`,
`37d0a92d…`) remain excluded. Detailed logs and fixtures are in ignored
`test-results/stability-followup-2026-09-29/`.

No new service, storage rewrite, dependency upgrades, feature removal or expanded
release acceptance is authorized by this maintenance task. Physical iPhone testing
is not part of this run.

## Diagnostics and advisory checks

The workspace-feature test binary passed 20 serial and four concurrent complete
crash/recovery runs: 144 write checkpoints, each checking recovery and replay.
The original exit 101 remains unexplained; do not claim it was fixed.

Remote runs `36603859037` and `36601833733` separately failed browser AS01 on both
Ubuntu and macOS, after their Rust/full gates passed. AS01 timed two browser clicks
and a durable HTTP response against 350 ms to infer that text debounce was skipped.
Adding 500 ms response latency reproduced its false failure. The corrected test
pauses browser timers and requires the status write to complete without advancing
them, while keeping the delayed response and source/identity assertions. All ten
autosave scenarios then passed. This changes the test, not writer durability.

The pinned OSV 2.6.0 scan covers npm, Cargo and validation-tool Python lockfiles.
The initial run returned no matching advisories; a known-vulnerable synthetic
requirements file failed (exit 1) and a missing input failed (exit 127). Scheduled
and dependency-change checks use the official pinned reusable workflow, including
its incomplete-scan guard, and publish findings to GitHub Code scanning. No package
versions changed. See SECURITY.md for the schedule, reproduction and triage.

Raw results: `crash-series.json`, `ci-4d13816-failed.log`,
`autosave-latency-before/`, `autosave-latency-after/`, `osv-results.json` and
`advisory-negative-checks.json` in the ignored evidence directory above.

The first remote [advisory run](https://github.com/Maciej1kti/astra/actions/runs/36611002516)
passed on `0f677b0`, including artifact publication and Code scanning upload.
The corresponding [source/package CI](https://github.com/Maciej1kti/astra/actions/runs/36611001323)
also passed on both Ubuntu 24.04 and macOS 15.

The editor's broad Chromium verification exposed another test race: counters
asserted source values as soon as OK was disabled, but OK is also disabled while
the write is in flight. The screenshot retained `Saving…` and the unsaved draft.
A focused rerun hit the same race on an earlier counter write. The suite now waits
for acknowledgement to clear the submitted counter draft before checking the
disabled button and durable source, including after replay. Its midnight scenario
also holds the request for 500 ms to cover the pending interval. The corrected
counter suite passed (`counter-ack-after/`); the original failures remain in
`browser-editor/counters/` and `counter-ack-before/`. No counter application or
durability rule changed.

## Editor boundary

`ResourceDescription.svelte` owns the card/project description's Markdown
display, edit mode, caret focus and pointer/keyboard transitions. It binds the
existing draft and asks the editor to finish a text edit. The header retains its
close-button reference and pointer guard so collapsing the description cannot
move the clicked close target. Title and description blur share one flush handler.
Autosave classification moved unchanged into `editor-draft.ts`, next to the
snapshots it compares. `Editor.svelte` shrank from 1,507 to 1,394 lines.

This is a responsibility boundary, not a bundle-size or performance claim. The
editor still owns command identity, queued drafts, conflicts and close/delete
coordination. Splitting those into independent controllers would risk creating
multiple owners for one pending write. If this area needs another change, the
header feedback/confirmation presentation is the next coherent extraction;
retain its existing controller and explicit callbacks.

WebKit exposed `EditableTitle` writing height inside its own ResizeObserver
delivery. It now responds only to width changes and schedules that height update
for the next animation frame; text edits still resize immediately and teardown
cancels the pending frame. The original editor/counter runs recorded repeated
observer errors; focused final runs retain strict page-error assertions and have
none. This fixes the cause rather than filtering those errors in the tests.

AS02 now waits for the browser's saved state before replacing its response handler;
the source may already be durable while the browser response remains in flight.
The macOS WebKit input fixture uses Option+Tab to include buttons, with an explicit
focused-option assertion before Escape. A standalone paired-host probe confirmed
that Tab left the menu while Option+Tab entered its first button. Production menu
behavior is unchanged.

One intermediate WebKit editor run passed all 14 behavior assertions but emitted
two access-control page diagnostics during navigation. An unchanged focused rerun
passed with no page errors. Their cause remains unconfirmed; the original output
is retained in `webkit-final/editor/`, and `webkit-editor-recheck/` records the
rerun. No authentication checks or error assertions were relaxed.

## What the older APIs mean

| Area | Current use | Compatibility kept |
| --- | --- | --- |
| Project tags | UI `TagManager`/`TagPicker` and typed CLI `tags list/preview/rename` use `/api/v1/projects/{id}/tags`, `/tags/preview` and `/tags/rename`. Names come from card labels, including archived cards. | This is the current source-backed model; no second vocabulary is needed. |
| Workspace vocabulary | Current UI and typed tag commands do not call it. | `GET`/`PUT /api/v1/workspace/tags` and `POST /api/v1/workspace/tags/preview` preserve optional `workspace.tags` and existing client behavior. |
| Milestones | Source documents, dated planning/attention projections, typed CLI `milestone`, history/undo and report targets still support them. | `/api/v1/projects/{id}/milestones` and resource/history routes remain part of the public contract. |

The distinction is scoped compatibility inside API v1, not a second complete API
version. [ADR-041](../docs/ADR-041-SOURCE-BACKED-FOCUS-AND-TAGS.md) explicitly
replaced the workspace vocabulary's UI ownership while retaining
[ADR-028](../docs/ADR-028-WORKSPACE-TAGS.md)'s endpoints. Dispatch and CLI routing
confirm that split. Changing the old vocabulary does not rename current project
labels; project renames use their own recoverable, version-checked workflow.

There is also unused frontend scaffolding: `getTagCatalog`, `previewTagChange`
and `replaceTags` have no current UI callers (the latter two retain compile-time
negative examples). `catalogNames`, `destinationTag`, `canFinishTagChange` and `TagChangeResult`
are referenced only by their legacy helper/tests. Removing those internal helpers
is separable from retiring server endpoints. Repository call-site analysis cannot
establish whether external clients use the public API.

The workspace vocabulary is the first candidate for a deliberate retirement
decision because the current product already uses project tags. Milestones need
a separate product decision: removing them affects persisted data, report targets,
planning and CLI, and is not just deleting unused UI. Neither API nor source format
was removed in this follow-up. Any later public-contract retirement must account
for existing data/clients and update contracts, examples, tests and an ADR together.

## Final verification

- Final full gate: 238 Rust, 110 JavaScript and 12 Python tests, contracts, types,
  formatting, boundaries, bundle budget and release build passed
  (`full-gate-release.log`).
- Broad release HTTPS/planning checks and 17 of 18 Chromium suites passed in
  `browser-editor/`; the counter assertion race above was corrected and verified
  separately. After the title change, all six affected suites passed again in
  `chromium-final/`. The final input-fixture adjustment passed in
  `chromium-inputs-final/`.
- WebKit editor, autosave, counters and input checks passed across `webkit-final/`,
  `webkit-editor-recheck/` and `webkit-inputs-final/`. Failed intermediate runs and
  their limits are described above. This is macOS WebKit automation, not a physical
  iPhone/Safari acceptance result.
- Rebuilt embedded frontend/release daemon; restarted the existing manual launcher
  and verified `https://100.122.250.14:47832` using its existing certificate.
  All 21 pre-restart resource versions, two pins, preferences and certificate are
  unchanged. Served JS/CSS match the built files byte for byte. Evidence:
  `manual-preservation.json`; the final project report was appended afterwards.

Environment: macOS 27 ARM64, Apple M4, 16 GiB, Node 24.11.0, Rust 1.92.0,
Python 3.14.6; release Chromium 153.0.8010.12 and WebKit 26.6.
