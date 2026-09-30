# Current implementation state

Updated 2026-09-30. The application is implemented and under verification;
full release acceptance remains open. [Scope decisions](SCOPE.md) supersede the
historical handoff. Use the [release checklist](../delivery/RELEASE-CHECKLIST.md)
for remaining acceptance, and [code structure](../docs/CODE-STRUCTURE.md) for ownership.

## Current work

The [ordered tag-read iteration](2026-09-30-tag-parallel-reads.md) uses bounded
source workers while retaining current versions, sorted partial issues and scan
limits. Required release global catalog median improves from 867 to 423 ms;
the 100-card project from 10.3 to 4.6 ms, and a 1,000-card project from 75.5 to
33.8 ms (p95 34.2, maximum 51.2). The full gate passes 265 Rust, 139 JavaScript
and 12 Python tests; tags/editor pass in Chromium and WebKit. The original manual
app is rebuilt/restarted, preserving 55 source versions, two pins, preferences
and certificate, with trusted HTTPS and all 33 assets verified. Broader
performance and release acceptance remain open.

The [dense Calendar probes](2026-09-30-calendar-initial-probes.md) test omitted
CSS-hidden details, simpler color selectors, lazy full-event conversion and
equal-row geometry reuse. Quiet release comparisons do not establish a useful
stable gain, so all four prototypes are restored. Current local warm rendering
is 167–171 ms median; constrained warm rendering is 984–1037 ms across two
controls. Reduced DOM/geometry operation counts alone do not prove faster
readiness. Initial dense rendering, source scans and the full objective remain open.

The [Focus eligibility/index iteration](2026-09-30-focus-eligibility-indexes.md)
checks receipt membership earlier and selects existing review/decision partial
indexes. The matched required release profile records all-read 50k receipts at
52.7 ms median / 59.5 ms p95 versus 85.5 / 91.9 ms; no-receipt median improves
from 22.5 to 15.2 ms. Further history distributions and earlier outliers remain
open. The full gate passes 260 Rust, 139 JavaScript and 12 Python tests; Focus,
events and protocol pass in Chromium and WebKit. The rebuilt manual app preserves
52 prior source versions, two pins, preferences and certificate; trusted HTTPS
and all 33 assets are verified. Full release acceptance remains open.

The [card layout controls](2026-09-30-card-layout-controls.md) add six-dot drag
handles and per-card eye toggles saved across devices. Hidden content and mounted
drafts are retained; the layout menu stays reachable when all sections are hidden.
The full gate passes 257 Rust, 139 JavaScript and 12 Python tests; six affected
Chromium suites, four WebKit suites and broad HTTPS/planning checks pass. The
rebuilt manual app preserves 49 prior resource versions, pins, preferences and
certificate; HTTPS and all 33 build files are verified. Physical-device and full
release acceptance remain open.

The [agent workflow guidance](2026-09-30-agent-workflow-guidance.md) now requires
short plans for substantial work, documentation updates alongside implementation
and appropriate Playwright verification. The documentation and full local gates
pass; this changes contributor instructions, not application behavior or acceptance.

The [tag source-read iteration](2026-09-30-tag-source-reads.md) reuses one guarded
collection reader per project while catalogs/previews still validate current
source files. On the required release fixture, global catalog median improves
from 1.77 to 0.87 seconds; the 100-card project catalog from 17.7 to 8.8 ms.
A separate 1,000-card project still has p95 78 ms. Fresh external labels, preview
versions and partial invalid/unsafe-file issues pass focused regressions. The full
gate passes 259 Rust, 139 JavaScript and 12 Python tests; tags/editor pass in
Chromium and WebKit. The rebuilt manual app preserves all 51 prior source versions,
two pins, preferences and certificate; HTTPS and all 33 assets are verified.

The [Focus receipt/prefix iteration](2026-09-30-focus-attention-prefix.md) builds
receipt membership once and bounds eligible unread candidates before the mixed
page. On the required release dataset, first-page p95 is 23 ms with no receipts
and 33 ms with 1,000; the latter control median was 3.6 seconds. An all-read
50k-receipt history still costs 95 ms median / 199 ms p95 with larger outliers.
The combined full gate passes 258 Rust, 139 JavaScript and 12 Python tests;
Focus, events, protocol and card-layout pass in Chromium and WebKit, plus broad
HTTPS. The rebuilt manual app preserves all 50 prior resource versions, two
pins, preferences and certificate; HTTPS and 33 served build files are verified.
No release acceptance is claimed.

The [Attention eligibility iteration](2026-09-30-attention-filters.md) avoids
expensive checks for rows outside each union branch. On the required release
dataset, ordinary Attention p95 improves from 86 to 33 ms; full Focus Attention
with 50k unread reports still costs 85 ms. An archival-set prototype regresses
that path and is reverted. The full gate passes 255 Rust, 137 JavaScript and 12
Python tests; four affected Chromium/WebKit suites, broad HTTPS and the combined
counter/card/Focus checks pass. The rebuilt manual app preserves all 45 prior
resource versions, pins, preferences and certificate; HTTPS and 33 assets are
verified. Full release acceptance remains open.

The [empty counter action](2026-09-30-empty-counter-action.md) exposes Add counter
directly when no counters exist, right-aligned in the same 44px action row. Existing
and archived-only counters retain the menu. The full gate passes 255 Rust, 137
JavaScript and 12 Python tests; affected Chromium/WebKit suites and 36 layout cases
pass. The rebuilt manual app preserves all 44 prior source versions, pins,
preferences and certificate, with HTTPS and all 33 build files verified.

The [bounded source-read iteration](2026-09-30-parallel-source.md) uses at most
four scoped readers with one nonblocking process-wide capacity guard. Alternating
1,000-card runs reduce create median from 163 to 116–117 ms and p95 from 170–175
to 119–135 ms. An earlier optimized run's 1,266 ms maximum remains recorded;
the target is not claimed unconditionally. The full 100-project/10k-card/50k-report
profile records mixed-write p95 43 ms and indexed-query p95 20 ms; Attention and
the legacy global tag catalog still cost 86 ms and 1.8 s. Full and combined gates
pass 255 Rust, 137 JavaScript and 12 Python tests; all 24 Chromium, five WebKit,
broad HTTPS and planning checks pass. The rebuilt manual app preserves all 42
prior resource versions, pins, preferences and certificate; its HTTPS address and
33 build files are verified. Full release acceptance remains open.

The [calendar presentation update](2026-09-30-calendar-design.md) adds a compact
mobile toolbar, readable agenda, a seven-column month grid that fits phones, and
flat event styling with separate overlapping hourly columns. Existing performance
adapters and paging remain intact. The full gate passes 252 Rust, 137 JavaScript
and 12 Python tests; five Chromium and four WebKit suites plus broad HTTPS/planning
checks pass. The rebuilt manual app preserves all 41 prior resources, pins,
preferences and certificate, with its HTTPS address and all 33 assets verified.
Physical-device and full release acceptance remain open.

The [source lease path iteration](2026-09-30-source-paths.md) removes a repeated
absolute traversal during collection reads, retaining current source/lease
checks and durable writes. With 1,000 cards, release create median/p95 improves
from 231/246 to 160/174 ms. The full gate passes 252 Rust, 137 JavaScript and 12
Python tests; all 24 Chromium and five applicable WebKit suites pass, with affected
card checks repeated on the combined frontend. The rebuilt manual app preserves
all 40 prior resource versions, pins, preferences and certificate; its HTTPS
address and 33 build files are verified. The 150 ms write target, physical-device
coverage and full release acceptance remain open.

The [counter footer follow-up](2026-09-30-counter-footer-spacing.md#divider-correction)
keeps the section divider with compact spacing below its menu. An initial removal
of the divider was corrected after owner clarification. The full gate and affected
Chromium/WebKit checks pass; the rebuilt manual app preserves all 39 prior resources
and its existing settings, with HTTPS/build assets verified.

The [counter actions menu](2026-09-30-counter-actions-menu.md) moves Add counter
and Archived into one three-dot menu below the list. Automatic placement keeps
both actions visible on short screens. The full gate passes 251 Rust, 137
JavaScript and 12 Python tests; four Chromium and three WebKit suites plus 48
menu geometry cases pass. The rebuilt manual app preserves 37 prior resources,
pins, preferences and certificate, with all HTTPS assets verified.

The [minimal card sections](2026-09-30-minimal-card-sections.md) remove visible
section headings and the counter gesture helper, retaining accessible names.
Add counter and the compact Archived toggle align right. The full gate passes
251 Rust, 137 JavaScript and 12 Python tests; six Chromium and four WebKit suites
pass. The rebuilt manual app preserves 35 prior resources, pins, preferences and
certificate, with all HTTPS assets verified. Physical-device acceptance remains open.

The [calendar refresh iteration](2026-09-30-calendar-refresh.md) retains displayed
event identities after identical ordinary reads. At 1,000 cards, no-change
refresh improves from 155 to 37 ms locally and from 879 to 352 ms under the
recorded network/CPU emulation. New source versions, changed metadata, scope,
editability, order and membership still publish; source reads remain fresh.
The combined full gate passes 251 Rust, 137 JavaScript and 12 Python tests;
broad HTTPS/planning, seven Chromium and six WebKit suites pass. The manual app
is rebuilt/restarted; all 34 existing source versions, pins, preferences and
certificate are preserved, and all 33 HTTPS assets are verified. Initial/changed-page
rendering, durable-write performance and release acceptance remain open.

A [remaining-cost ranking](2026-09-30-performance-ranking.md) covers all seven
desktop views plus first-card/Settings opening with a 1,000-card release fixture.
Local warm views are about 38–40 ms except the 163 ms Calendar grid; constrained
Calendar remains about 999 ms. This small ranking run is not p95/device acceptance.
The repeated lease traversal is measured separately in the source path iteration.

A [calendar rendering follow-up](2026-09-30-calendar-followup.md) tests two further
ways to reduce header reads and hidden-list copying. The release comparison does
not show a noticeable latency gain, so both prototypes are reverted. Initial
rendering still retains 7,339 DOM elements in the 1,000-card fixture; reducing this
cost requires new behavioral evidence rather than omitting dated items.

The [compact card counters](2026-09-30-compact-card-counters.md) add 14-day charts,
horizontal scrubbing and guarded numeric entry in compact rows. Redundant clock
metadata is removed; history and prior-day draft context remain available.
Raw drafts survive reordering, autosave, session loss and midnight. The full gate
passes 251 Rust, 133 JavaScript and 12 Python tests; eight Chromium and five
WebKit suites pass. The rebuilt manual app preserves all 33 existing resource
versions, pins, preferences and certificate; its HTTPS build assets are verified.
Physical-device and full release acceptance remain open.

The [unified card section order](2026-09-30-unified-card-sections.md) removes the
Content/Properties split. All six sections can be freely interleaved in one
responsive reading column, retaining mounted drafts, animation and prior browser
preferences. The full gate passes 251 Rust, 126 JavaScript and 12 Python tests;
eight Chromium and four WebKit suites pass. The rebuilt manual app preserves all
31 existing resource versions, pins, preferences and certificate; its HTTPS build
assets are verified. Physical-device and full release acceptance remain open.

The [Focus cards and calendar follow-up](2026-09-30-focus-counters-calendar.md)
adds compact daily counter scrubbing/numeric entry with explicit confirmation,
retained conditional command recovery, and a range calendar in the card editor.
The full gate passes 251 Rust, 125 JavaScript and 12 Python tests; fourteen
Chromium and five WebKit suites cover the change. The manual app is rebuilt and
restarted: HTTPS/build assets, 30 existing resource versions, pins, preferences
and certificate are verified. Physical mobile-device and full release acceptance
remain open.


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

The owner then requested [deeper performance work](2026-09-30-deep-performance.md).
Scoped collection descriptors remove repeated source-directory work while every
file retains current lease, parent, file and version checks. At 1,000 cards,
release creation p50 falls from 318 to 229 ms; mixed write p95 from 326 to 233 ms,
still above the 150 ms target. Hash formatting also avoids temporary strings.
The full gate passes 244 Rust, 112 JavaScript and 12 Python tests; all 20 Chromium
suites, broad HTTPS, WebKit Focus and the manual restart check pass. Python is
tooling/optional Linux integration, outside ordinary browser requests. Desktop
Calendar profiling identifies remaining transfer and browser-rendering costs.
A further verified iteration negotiates bounded fast gzip for authenticated
summary reads, with identity compatibility and unchanged source/credential/command
boundaries. Large desktop Calendar JSON falls from 344 to 75 KB; warm constrained
readiness falls from 1479 to 1081 ms, with the same returned items and DOM.
The gate passes 249 Rust, 112 JavaScript and 12 Python tests; all 20 Chromium
suites, six affected WebKit suites, broad HTTPS and manual restart checks pass.
Rust dependency advisory/license review passes at this checkpoint. Calendar
rendering and the durable-write target still require further performance work.

The initial [responsive card modal](2026-09-30-card-modal-layout.md) gave desktop
cards a reading column and properties sidebar, stacked the content on tablets,
and used the phone viewport with a persistent header. Shared headings, labeled
status, clearer sections and an unclipped two-line title preserve existing
editing behavior. The isolated full gate, thirteen release Chromium suites and
six WebKit suites pass. The manual app is rebuilt/restarted; its HTTPS assets,
28 existing resource versions, pins, settings and certificate are verified.
Broader WebKit test limitations are recorded in the evidence; physical-device
and release acceptance remain open.

The [card usage follow-up](2026-09-30-card-usage-layout.md) collapses existing
schedules to relative time, preserves expanded creation fields and adds browser
preferences for section order. Keyed controls retain drafts through animated
movement; reduced motion is respected. Shared menus now handle WebKit pointer
focus and Escape, and restoring valid original dates clears stale validation
feedback without a write. The final full gate passes 249 Rust, 119 JavaScript
and 12 Python tests; affected Chromium and targeted WebKit checks pass. Existing
broader WebKit dialog failures are reproduced against the previous frontend and
documented. The manual app is rebuilt/restarted with all 29 existing resource
versions, pins, preferences, certificate and 33 HTTPS assets verified.

The [calendar rendering iteration](2026-09-30-calendar-rendering.md) eliminates
repeated geometry reads, unused event-time formatting and accumulated array
copies. With 1,000 cards, warm readiness improves from 190 to 160 ms locally
and 1064 to 972 ms under the recorded network/CPU emulation. Initial and integrated
full gates, broad HTTPS/planning, Chromium and eight affected WebKit checks pass;
the integrated comments check passes after correcting its obsolete Focus selector.
It also fixes a reproduced retained-editor exception after session revocation by
preserving the last authenticated timezone for locked drafts. The combined manual
release at `16a6935` is rebuilt/restarted and all 33 HTTPS assets are verified.
Restart evidence and later owner edits are distinguished in the report. The
overall performance objective and release acceptance remain open.

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
