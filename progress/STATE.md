# Current implementation state

Updated 2026-09-30. The application is implemented and under verification;
full release acceptance remains open. [Scope decisions](SCOPE.md) supersede the
historical handoff. Use the [release checklist](../delivery/RELEASE-CHECKLIST.md)
for remaining acceptance, and [code structure](../docs/CODE-STRUCTURE.md) for ownership.

## Current work

The [repository audit](2026-09-29-repository-audit.md) reproduced A01–A07 and
measured source-scan bottlenecks. The owner authorized a bounded
[three-pass remediation](2026-09-29-three-pass-plan.md): fixes, measured optimization,
then a final audit. All three passes are complete: A01–A07 and maintained-guide
corrections are verified, Focus reads use a measured partial pin index, and the
final boundary audit found no further reproducible application defect. This is not release acceptance.
Its read/client changes are described in
[ADR-050](../docs/ADR-050-READ-RECOVERY-AND-CONFIRMATION.md).

The final gate passed 238 Rust, 110 JavaScript and 12 Python tests,
broad HTTPS/planning checks and 18 release Chromium suites. WebKit session
recovery/preferences also passed. The manual app is
rebuilt, restarted and verified with existing resources, pins, preferences and
certificate preserved. The pass-2 pin index brings Focus membership p95 to
0.35 ms for 10,000 cards/one pin; durable creation remains above its performance
target. One crash-test child failed once and passed focused/full reruns; its
cause remains unknown and future failures now retain child diagnostics.
See the remediation checkpoint for measurements, this failure and other limits.

The owner requested a [stability follow-up](2026-09-29-stability-followup.md):
bounded crash diagnostics, advisory CI and editor simplification. It is complete:
the crash test passed 24 further runs; advisory and source/package CI passed on
the diagnostics commit. Description editing has its own component, title resizing
no longer feeds back into its observer, and browser tests wait for acknowledged
writes. The final full gate and affected release Chromium/WebKit checks pass.
The manual app is rebuilt/restarted with its existing state and HTTPS verified.
Legacy API roles and remaining diagnostic limits are recorded in the follow-up;
no compatibility endpoint or source format was removed.

A subsequent [loading profile](2026-09-29-loading-profile.md) measures the release
UI and ranks possible speed improvements. The clearest candidate is a 200 ms
navigation debounce; smaller startup code and fewer serial reads are additional
options. This profiling changed no application code or acceptance status.

The owner then authorized [iterative performance optimization](2026-09-29-performance-optimization.md)
until further improvements become unnoticeable. Its first verified iteration
removes the navigation delay, splits secondary UI code and overlaps startup
reads. Initial JS/CSS drops to 61.8 KiB gzip; local view changes take about 30 ms
in the small release fixture. The manual app is rebuilt/restarted and verified.
A second verified iteration preloads selected planning widgets, warms the editor
after initial data and bounds agenda pages to 200 items with explicit pagination.
At 1,000 cards, warm Calendar improves from 1.73 s to 0.63 s under the recorded
network/CPU emulation; first-card opening falls from 317 to 192 ms. The full gate,
affected Chromium/WebKit checks and manual HTTPS restart verification pass.
A third verified iteration returns pin summaries in Focus's membership snapshot,
preserving older-host compatibility and current-source reads before editing.
At 1,000 cards/ten pins, warm constrained Focus improves from 935 to 523 ms.
The full gate passes 239 Rust, 112 JavaScript and 12 Python tests; affected
Chromium/WebKit and manual HTTPS restart checks pass. Transfer costs and desktop
planning rendering remain candidates; the performance objective remains open.

## Implemented product

- Shared Rust domain/application rules, strict JSON sources and generated browser
  contracts; conditional durable writes, unchanged retries, recovery and history.
- Explicit folder registration, host-native selection, pairing and sessions;
  shared HTTP/Unix engine, CLI and disposable search projections.
- Projects, source-backed Focus pins, project folders/tags, board, card lists,
  calendar and timeline; inclusive plans and timed events.
- Card checklists, human/bot comments, daily counters and protected autosave drafts.
  Reports target projects or milestones; reports support explicit permanent deletion.
- Versioned workspace preferences and pin ordering, read receipts, undo,
  diagnostics, Git observation, maintenance workflows and packaging.
- Milestones and legacy workspace tag APIs remain supported; their retirement
  requires an owner decision. Card relations/blockers and separate card deadlines
  were removed by later scope decisions. Kanban remains under its feature freeze.

Use [Development](../DEVELOPMENT.md) for setup, [CLI](../CLI.md) for commands and
[Manual testing](../MANUAL-TESTING.md) for the existing manual app and walkthrough.
After verified application changes, rebuild and restart that manual app preserving
its data, HTTPS address, certificates and settings, then verify the address.

## Outstanding obligations

Physical iPhone/Safari, Arch/ext4, physical power-loss, login-start and complete
performance/reliability acceptance remain open. Browser emulation is not a device
test. Local checks do not establish remote CI or packaged release acceptance.
The owner must choose the license and supported-release security-reporting channel.
Built-in backup archives and source migration frameworks remain deferred;
stopped-copy recovery and operational compatibility remain required.

Earlier audit follow-ups for additional named frontend endpoints, smoke-suite
separation and Q10 vendor assumptions remain recorded in
[the earlier audit](audit-fixes-2026-09-08/README.md). Apply them when justified;
they are not permission for a broad rewrite or additional product scope.

## Evidence navigation

- [Audit baseline and limitations](2026-09-29-repository-audit.md).
- [Daily counters](2026-09-26-daily-card-counters.md),
  [card header feedback](2026-09-26-card-header-feedback.md),
  [daily Focus](2026-09-26-focus-daily-sections.md).
- [JSON sources](2026-09-26-json-sources.md),
  [comments](2026-09-26-card-comments.md),
  [timed events](2026-09-26-timed-events.md),
  [report deletion](2026-09-26-report-deletion-api.md).
- [Earlier evidence guidance](README.md),
  [complete previous status with dated feature records](https://github.com/Maciej1kti/astra/blob/1a8f6503be280fb2cbaf101022f8ec01487c42d2/progress/STATE.md).

Historical evidence applies only to its recorded revision. The immutable status
reference preserves the previous narrative; no requirement or acceptance result
was removed or changed by this consolidation.
