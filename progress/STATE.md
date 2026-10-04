# Current implementation state

Updated 2026-10-04. The application is implemented and under verification;
full release acceptance remains open. [Scope decisions](SCOPE.md) supersede the
historical handoff. Use the [release checklist](../delivery/RELEASE-CHECKLIST.md)
for remaining acceptance, and [code structure](../docs/CODE-STRUCTURE.md) for ownership.

## Current work

The [UI component audit](2026-10-04-ui-component-audit.md) consolidates native
menus, modal close/focus ownership and four vertical ordering adapters, with shared
cancellation across Board/date/counter gestures. It fixes stale local drops,
conditional Focus previews, transformed-dialog geometry, narrow controls and
navigation rotation. The combined 598-test gate, all 35 existing/audit Chromium
suites, eleven selected WebKit suites and broad HTTPS/planning workflows pass.
The rebuilt existing manual app preserves 30 versions, two pins, both profiles'
settings/roots/registrations, identity/epoch and certificate; all 42 served assets
match. The audit also builds independently of the concurrent Main feature.
Physical-device and complete release acceptance remain open.

The [counter Chart dashboard](2026-10-04-counter-chart.md) adds selectable histories,
unit-aware overlays, aggregation, statistics and browser-local rate valuation.
The 528-test full gate, nine Chart scenarios in Chromium/WebKit and affected
navigation/counter/loading suites pass. The rebuilt existing HTTPS app verifies
all 36 assets while preserving 29 prior versions, two pins, both profiles' settings,
roots and registrations, identity/epoch and certificate. Synthetic histories are
limited to removed temporary hosts; existing counters remain unchanged.

The [shared exercise project implementation](2026-10-04-shared-exercise-project.md)
adds conditional profile names and shared source folders within one trusted host.
The live Maciek profile retains all 15 projects; Tomek shares `cwiczenia` and its
Pompki counter (`rep`, step 1). The 510-test full gate, Chromium/WebKit profile
scenarios, counter regressions and broad HTTPS smoke pass. Two verified manual
restarts preserve 28 source versions, settings, identity/epoch and certificate;
the final readback confirms both profiles use one card and counter source.

The [compact navigation feature](2026-10-04-compact-navigation.md) gives phones a
Focus/Projects/More bar, off-bar view access and browser-local order/visibility
controls. The combined 494-test full gate, Chromium/WebKit navigation and motion,
Chromium dialogs/card-layout and broad HTTPS smoke pass. The rebuilt existing app
preserves all 25 prior resource versions, settings, certificate and instance/epoch;
trusted HTTPS verifies all 32 assets. A combined responsive-suite attempt remains
blocked by the concurrent profile header's 320px picker width; navigation bounds
and selection pass independently. Physical-device acceptance remains open.

The [trusted user profiles implementation](2026-10-04-trusted-user-profiles.md)
adds separate project folders and workspace state in one daemon, with profile
creation/selection in Settings and CLI. Existing data stays in the default profile;
pairing is shared, and all paired users may select every profile. The 494-test full gate,
affected Chromium/WebKit suites and navigation-adapted broad HTTPS smoke pass.
The rebuilt existing application preserves 25 prior versions, one Focus pin,
settings, instance/epoch and certificate; all 32 served assets match. The earlier
[folder review](2026-10-04-multi-user-folder-review.md) remains historical evidence.

The [deleted-project diagnostics correction](2026-10-03-deleted-project-diagnostics.md)
prevents delayed filesystem notifications from recreating source warnings after
successful deletion. The 473-test full gate and all 14 release Chromium deletion scenarios pass.
The rebuilt existing manual app is restarted and verified over trusted HTTPS:
zero source issues, all 32 assets, 22 remaining versions, pins, settings and
certificate preserved. Two concurrent owner card deletions are accounted for;
WebKit suite startup is blocked by its unsupported clipboard permission.

The [soft-motion refinement](2026-10-01-soft-motion.md) gives entrances a gentle
opacity onset, shallow movement and bounded blur on small headings/details.
Card context, title, metadata, labels and counter footers have distinct layers
across Focus, Projects, List and both Board modes. Calendar adds readiness-aware
grid/event layers, agenda day groups and a layered overflow popup on desktop and
mobile. The combined 471-test full gate, affected Chromium/WebKit suites and
broad HTTPS smoke pass. The rebuilt existing manual app preserves 82 prior
versions, three pins, settings, certificate and instance/epoch; all 32 served assets
match over trusted HTTPS. The ordinary CLI report is committed/read back, with
concurrent owner card edits separate. Physical-device and release acceptance remain
open. The [maintained motion reference](../docs/DESIGN-SYSTEM.md#motion-vocabulary)
also records all shared parameters, component sequences, extension rules and
focused browser checks; the documentation-only handoff passes link/command checks.

The [context entry allocation iteration](2026-10-01-context-entry-allocation.md)
borrows validated bodies and moves selected metadata into the existing response.
Twelve release pairs preserve full normalized output and all 960 selected current
version/order/budget checks. Rich dense medians repeat 1.0–1.4 ms savings; ordinary
gains are negligible and tails remain variable. Eight focused context tests and
the 471-test full gate pass; normally paired Chromium/WebKit protocol and all 14
editor scenarios pass in both engines. The rebuilt existing HTTPS app preserves
all 81 prior versions, three pins, preferences, certificate, instance/epoch and
complete CLI context; all 32 served assets match. The ordinary report is committed
and read back; owner card changes remain separate. Complete interaction profiling,
broader perceived performance and platform/release acceptance remain open.

The [bounded JSON map probe](2026-10-01-source-map-probe.md) is rejected and restored.
Eight balanced release pairs preserve full normalized output and all 640 selected
source/version/order/budget checks, but ordinary results change direction and rich
savings are only 0.12–0.69 ms. Documentation/package validation passes; there is no
new application restart or acceptance claim. The retained metadata counter and
independent Focus counter changes remain. Context entry construction still copies
full bodies before selecting excerpts and is the next allocation to measure.

The [Focus counter footer correction](2026-10-01-focus-section-counters.md) supplies
In motion and Events with the same bounded daily counter preview as pins. Their
shared cards now expose the complete footer without per-card source reads. The
combined release-profile full gate passes 469 tests and affected Chromium/WebKit suites
pass, including conditional saves, cancellation, narrow layouts and reload.
The rebuilt manual app preserves 79 prior versions, three pins, settings,
certificate and native CLI context; trusted HTTPS verifies all 32 assets.

The [motion choreography follow-up](2026-10-01-motion-choreography.md) addresses
rushed visible motion with calmer shared curves and explicit heading/content/detail
sequences across pages, dialogs, menus and controls. Sections follow their visible
order; tags enter after their section and only pulse when explicitly added.
Bounded measurements, native lifetimes and live reduced-motion behavior remain.
The 468-test integrated full gate, all 28 Chromium suites, the broad HTTPS smoke
and seven selected WebKit suites pass; integrated motion/protocol checks also
pass in both engines. The rebuilt existing manual app verifies all 32 assets
over trusted HTTPS, preserving all 78 prior versions, three pins, preferences,
certificate and instance/epoch. The ordinary CLI report is committed/read back;
concurrent owner card edits remain separate. Physical-device and release acceptance
remain open.

The [canonical metadata-counter iteration](2026-10-01-source-metadata-budget.md)
uses the ordinary pretty-JSON serializer without retaining a temporary metadata
buffer. Exact limits, parser rejection order and canonical durable bytes remain.
Three release comparisons show 1.4–3.2 ms gains for rich dense contexts; small
contexts are unchanged and ordinary/long-body gains are below 1 ms outside an
unrepeated control outlier. All 800 selected context reads retain result/version/
budget checks and full normalized equality. Isolated serializer pairs retain
240,000 exact-length checks; they do not establish full UI or process-memory gains.
Nine document tests and the 468-test full gate pass. Normally paired Chromium/
WebKit protocol and all 14 editor scenarios pass in both engines. The rebuilt
manual app preserves all 77 prior versions, three pins, preferences, certificate,
instance/epoch and complete native CLI context. Trusted HTTPS verifies all 32
assets; the ordinary report is committed/read back with both owner card changes
separate. Broader performance and acceptance remain open.

The [scoped context-read iteration](2026-10-01-context-candidate-reads.md) reuses
one guarded collection reader per consecutive candidate kind. Every source read,
version, bound and unavailable-source hint remains. Balanced release comparisons
repeat 3.2–3.4 ms savings for small contexts and 16.9–18.9 ms for ordinary/rich
dense contexts; two later long-body pairs save about 18 ms after an unstable first
pair. All 720 selected observations retain result checks and full normalized
outputs match in nine pairs. Six context/three reader guard regressions pass.
The full gate passes 467 tests before and after the independent motion integration;
normally paired Chromium/WebKit protocol checks also pass before and after it.
The original frontend/release daemon are rebuilt and the existing manual app is
restarted, preserving all 76 prior versions, three pins, preferences, certificate,
instance/epoch and complete CLI context. Trusted HTTPS verifies all 32 assets;
the ordinary report is committed/read back with both owner card changes separate.
Broader perceived performance, platform coverage and release acceptance remain open.

The [shared motion system](2026-10-01-motion-system.md) adds bounded readiness
cascades, continuous navigation selection, native dialog/menu entrances and exits,
and shared control feedback. Reduced-motion changes settle active effects. The
implementation preserves the concurrent UI corrections and passes the 466-test
full gate, broad HTTPS/planning checks, all 28 Chromium suites and eleven selected
WebKit suites including corrected fixture reruns. Light/dark and narrow rendered
surfaces are inspected. The rebuilt existing manual app verifies trusted HTTPS
and all 32 assets while preserving 75 prior source versions, three pins,
preferences, certificate, instance and epoch. The ordinary CLI report is committed
and read back; concurrent owner card edits remain separate. Physical-device and
full release acceptance remain open.

The [owner-directed UI corrections](2026-10-01-ui-corrections.md) unify Focus card
presentation, repair the main header corners, save Calendar pointer changes without
a confirmation step and add Timeline row ordering and dated blank-row creation.
The 466-test full gate and seven final WebKit suites pass. The broad HTTPS/planning checks and all 27 Chromium suites also pass. Final style reruns pass in both engines. The rebuilt existing manual app verifies
trusted HTTPS and all 32 assets, preserving 74 prior versions, three pins,
preferences, certificate, epoch and complete CLI context. The ordinary CLI report
is committed and read back; concurrent owner card changes remain separate. Independent milestones retain their
working API/CLI and report contracts.

The [context byte-accounting iteration](2026-10-01-context-budget.md) replaces
repeated whole-response serialization with exact request-local entry/comma/count
accounting, retaining every source read and final full JSON bound check. Two quiet
release series save 25.2–25.3 ms (about 20%) for rich large contexts and 5.5–6.2 ms
for ordinary maximum-budget contexts; small/minimum responses gain only about
0.25 ms. All 800 selected observations retain source/version/budget checks and
full normalized outputs match the control. The full gate passes 465 tests after
resolving disk exhaustion with a cache discard and serial independent Rust tests.
Normally paired Chromium/WebKit protocol checks retain complete HTTP/CLI equality,
budget bounds and five-view stale-page recovery. The rebuilt manual app preserves
72 prior versions, two pins, preferences, certificate, epoch and complete native
CLI context. Trusted HTTPS verifies all 32 served assets; the ordinary CLI report
is committed/read back with the owner card preserved. Body materialization and
candidate-read costs remain the next context investigations; broader performance
and release acceptance remain open.

The [source pin-read iteration](2026-10-01-source-focus-stream.md) replaces full
parsed-card retention with bounded ordered source visits and at most 101 pin
ID/position pairs. For 1,000 long-body cards, incremental live Rust allocation
falls from approximately 63.4 MiB to 1 MiB; whole-process RSS falls only about
5 MiB. Matched release context medians cost approximately 0.25–1.22 ms more,
so this is accepted for its memory bound, without claiming faster readiness.
All 480 selected latency observations retain source/order/version/budget checks.
The full gate passes 462 tests, including real source/pin boundaries; paired
Chromium/WebKit Focus and protocol checks pass. The rebuilt manual app preserves
71 prior versions, two pins, preferences, certificate, epoch and complete native
CLI context. Trusted HTTPS verifies all 32 served assets. The ordinary CLI report
is committed/read back, preserving the owner card. Broader performance and
release acceptance remain open.

The [CLI runtime probe](2026-10-01-cli-runtime-probe.md) rejects a single-thread
client runtime after two quiet release series show only 0.09–0.16 ms median savings.
All 2,400 selected native observations retain result/identity/version checks.
The source is restored; documentation/package validation passes, with the manual
application unchanged. Temporary full-card retention during source pin discovery
is the next investigation. Broader performance and release acceptance remain open.

The [Focus widget Rust reader](2026-10-01-widget-focus-reader.md) replaces its
Python status reader with the existing CLI and one bounded membership-summary
read. Three quiet release series include complete process startup: medians fall
from 26–33 ms to 2.8–3.7 ms, with all 720 selected observations retaining result
checks. Reference-only hosts keep bounded detail reads; stale/missing pins remain
unavailable. The final full gate passes 456 tests, with nine new native reader
regressions. Chromium/WebKit Focus, protocol and code-health checks pass, including
final Focus/protocol reruns. The rebuilt manual app preserves 69 prior versions,
two pins, preferences, epoch and certificate; trusted HTTPS verifies all 32 served
assets and the new CLI preview matches the running snapshot. The ordinary CLI
report is committed/read back. Python remains in the independent window helper;
Linux shell/QML, broader performance and release acceptance remain open.

The [tag-source cost probes](2026-10-01-tag-source-cost-probes.md) attribute
ordinary source cost primarily to guarded filesystem reads. A bounded allocation
hint saves only 0.21–0.45 ms for 1,000 ordinary cards and reverses on the global
required fixture; paired worker handoff regresses dense reads and global catalog
readiness. Both prototypes and the temporary example are restored. Release result
checks and documentation/package validation pass. Application, manual instance
and prior verification remain unchanged. The optional Python Omarchy status helper's
six-read fan-out is identified as the next investigation; broader performance
and release acceptance remain open.

The [editor source-overlap iteration](2026-10-01-editor-source-overlap.md) starts
the required current source first, then fresh project/tag reads alongside it.
Quiet constrained complete readiness improves by 84–87 ms for 37 cards and
19–21 ms for whole-month plans; dense local rendered readiness remains about
30 ms. All 448 selected samples retain ordinary read/identity checks. A context-first
prototype is rejected after it delays local source/rendered readiness. Cancellation,
pre-editor tag invalidation and Labels handoff retain current-source rules.
The full gate passes 452 tests; all 26 Chromium and 12 affected WebKit suites,
including corrected fixture reruns, and broad HTTPS/planning interactions pass.
The rebuilt manual app preserves 67 prior resource versions, two pins, preferences
and certificate; trusted HTTPS verifies all 32 served assets. The ordinary CLI
report is committed and read back. Broader performance and release acceptance
remain open.

The [complete Calendar popup renderer](2026-10-01-calendar-popup-rendering.md)
retains every row, current version and native interaction while removing three
component layers for known Astra content. Quiet retained-build whole-month
popup medians improve from 87 to 69 ms locally and 292 to 240 ms with CPU ×4.
WebKit popup margins and scrollbar-covered resize handles are corrected. All 784
selected samples retain their ordinary read/identity checks. The full gate passes
444 tests; 26 Chromium suites pass before final spacing, and nine affected suites
per engine plus broad HTTPS/planning checks pass on the retained build. The
rebuilt manual app preserves 66 prior resource versions, two pins, preferences
and certificate; trusted HTTPS verifies all 33 served assets. The ordinary CLI
report is committed and read back. Existing WebKit header/screenshot limits,
broader performance and release acceptance remain open.

The [Calendar popup probes](2026-10-01-calendar-popup-probes.md) reject deferred
event normalization, delegated row handlers, removal of one component layer and
an early measured opening bound. None establishes a useful repeatable gain;
the bound's initial improvement reverses in a quiet repeat. All application
prototypes are restored. All 560 measured samples retain full popup membership
and current source checks, with 280 single-read Calendar openings, 140 popup
openings without reads and 140 three-read editor openings. An exact saved-profile
frame lookup identifies the native dialog opening callback as the hot frame,
not chunk sorting. The normal CLI report is committed and read back, with the
owner card preserved. The deployed application remains unchanged; native DOM/layout
cost and broader performance/acceptance work remain open.

The [editor read-overlap iteration](2026-10-01-editor-read-overlap.md) starts fresh
project/tag reads before native modal layout with an explicit immediate-read option.
Default read cancellation, source versions and durable command rules remain.
Quiet constrained editor opening improves by 65–82 ms across four workloads;
the quiet repeat confirms 71–72 ms, and small local opening repeats at 74 → 31 ms.
Calendar readiness is broadly unchanged. All measured editor openings retain the
current source and both context reads. The full gate passes 441 tests; 25 Chromium
and nine affected WebKit suites plus broad HTTPS/planning checks pass. A default
eager-read probe is rejected after a reproduced Calendar mode-transition failure;
the selected mode passes the unchanged scenario. The rebuilt manual app preserves
64 prior resource versions, two pins, preferences and certificate; trusted HTTPS
and all 33 served assets are verified. The normal CLI report is committed and
read back. Broader performance and release acceptance remain open.

The [Calendar pass-work iteration](2026-10-01-calendar-pass-work.md) reuses
current cell/span capacity within one layout pass and reads normalized numeric
Date values with native exclusive/resource semantics. Quiet release constrained
whole-month filter clearing improves from 129–145 to 96–97 ms; warm opening from
about 601–602 to 579–580 ms, locally 58–59 to about 50 ms. Small-fixture times are
broadly unchanged. All final/repeat 280 openings retain one Calendar GET; all
280 filter actions retain zero. The full gate passes 433 tests. Chromium/WebKit
verify actual geometry, complete popups, versions and interactions. A hidden-item
startup oracle is corrected after three identical saved-control failures.
The rebuilt manual app preserves 63 prior resource versions, two pins, preferences
and certificate; trusted HTTPS and all 33 assets are verified. The normal CLI
report is committed/read back. Broader performance and release acceptance remain open.

The [Calendar main-grid DOM iteration](2026-10-01-calendar-sparse-grid.md)
retains all native chunks and full day popups while mounting only visible events
and actually measured snippet shapes. Quiet release whole-month local cold/warm
medians improve from 261/214 to 100/60 ms; with CPU ×4 and 100 ms latency, from
1554/1265 to 946/615 ms. Live document elements fall from 10,338 to 679–682.
Small-fixture times remain broadly unchanged; short/timed plans also improve.
All 224 matched openings retain one Calendar GET. The full gate passes 428 tests;
Chromium/WebKit verify exact counts, natural heights, current versions, complete
popups and interactions. The rebuilt manual app preserves 62 prior resource
versions, two pins, preferences and certificate; trusted HTTPS and all 33 assets
are verified. The normal CLI report is committed and read back. Broader
performance and release acceptance remain open.

The [planning read-scope iteration](2026-10-01-planning-read-scopes.md) removes
redundant initial-route and loaded-title-filter reads in Calendar, Gantt and Board.
With CPU ×4 and 100 ms latency, dense Calendar filtering improves from 262 to
46 ms and clearing from 363 to 177 ms; Gantt filtering from 175 to 28 ms.
All 168 measured selected filter actions issue zero planning GETs. Ordinary
opening medians are broadly unchanged. The full gate passes 428 tests, and
Chromium/WebKit verify current source versions and retained invalidations.
The rebuilt manual app preserves 61 prior source versions, two pins, preferences
and certificate; trusted HTTPS and all 33 assets are verified, with the normal
CLI report committed/read back. Broader performance and acceptance remain open.

The [measured Calendar month renderer](2026-10-01-calendar-measured-rendering.md)
retains every native chunk and complete popup while simplifying hidden components
and measuring actual native snippet shapes. Quiet release 1000-card local cold
medians improve from 199–204 to about 110 ms for short plans/timed events, and
737 to 252 ms for whole-month plans; constrained whole-month cold improves from
3.23 to 1.48 seconds. Small-fixture medians are unchanged. The full gate passes
427 tests; Chromium/WebKit verify natural heights, exact hidden counts, versions
and complete interactions. The rebuilt manual app preserves 60 prior source
versions, two pins, preferences and certificate; trusted HTTPS and all 33 assets
are verified. The normal CLI report is committed and read back; broader
performance and acceptance remain open.

The [Calendar hidden-list iteration](2026-10-01-calendar-hidden-lists.md)
replaces repeated growing-array copies and linear duplicate checks with one
pass-local collection/publication per changed day. Whole-month plans retain
44,134 DOM elements and all popup/source behavior; quiet release cold medians
improve by 31–41 ms locally, with constrained cold/warm gains of about
139–191 ms. Local warm readiness remains variable. Seven focused tests and four
release Chromium/WebKit suites pass, including exact hidden counts across
330 added cards. The full gate passes 269 Rust, 142 JavaScript and 12 Python
tests. The rebuilt manual app preserves 59 prior resource versions, two pins,
preferences and certificate; trusted HTTPS and all 33 assets are verified.
The normal CLI report is committed and read back. Broader
performance and acceptance remain open.

The [Calendar geometry/query probes](2026-10-01-calendar-probes.md) reject
initial-header removal, automatic content visibility, remembered skipped sizes,
layout/paint containment and an early SQL type restriction. Automatic visibility
repeats an 8–15 ms local / 74–77 ms constrained warm gain, but a controlled
large-text probe exposes underestimated skipped heights. The Rust query already
uses branch-specific indexes: the 100-project, 10k-card, 50k-report global page
measures 14.25 ms median / 14.69 ms p95; a scoped page is below 1 ms. All
application prototypes are restored. The full gate passes 269 Rust, 139
JavaScript and 12 Python tests; the normal CLI report is committed and read back.
The deployed application is unchanged. Broader performance and acceptance
remain open.

The [request-local receipt iteration](2026-09-30-focus-rust-receipts.md) replaces
SQLite concatenation/tree membership with a lazy Rust hash predicate and an
ordered unread index under the existing snapshot. Required all-read note-history
release calls improve from 52.8–53.2 ms median / 57.6–58.3 ms p95 to 30.5 / 31.2 ms.
A concentrated 50k-report index comparison improves 58 to 2.1 ms without receipts;
mixed follow-ups retain 30–39 ms medians. Ten attention regressions pass, including
request cleanup, concurrent scoped/general reads and older-index restoration.
The full gate passes 269 Rust, 139 JavaScript and 12 Python tests; Focus/protocol
pass in Chromium and WebKit. The original manual app is rebuilt/restarted,
preserving 57 prior source versions, pins, preferences and certificate; trusted
HTTPS and all 33 assets are verified. The normal CLI report is committed and
read back. Broader performance and acceptance remain open.

The [decision-history iteration](2026-09-30-focus-decision-histories.md) replaces
per-decision history scans with statement-local closure membership and bounded
priority prefixes. Required mixed-history release medians improve from 3.4–3.5
seconds to 30–38 ms; a separate concentrated 50k-report profile measures 18–26 ms.
Three focused regressions and the full gate pass (268 Rust, 139 JavaScript,
12 Python); Focus/protocol pass in Chromium and WebKit. The original manual app
is rebuilt/restarted, preserving 56 prior source versions, pins, preferences and
certificate; trusted HTTPS and all 33 assets are verified. Note-only receipt tails
and broader performance remain open.

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
