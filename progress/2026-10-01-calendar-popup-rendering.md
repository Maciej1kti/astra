# Complete Calendar popup rendering

Starting revision: `52805df4e74f3d991fbcb9577851ff04112ca35d`; its application
implementation is `8fdff83f387985e030f892d6441309bc7054b4a7`.
Broader performance and release acceptance remain open.

## Selected change

Known Astra popup rows retain the existing content snippet and native Resizer
while replacing three nested native components with one application-owned
adapter. Full popup membership, natural wrapping, clipping/interaction classes,
keyboard source opening and native pointer arguments remain. Custom
styles/classes, resources, content/lifecycle/mouse hooks and unknown shapes
retain the original Event component. The build uses the pinned native date and
event helpers, and exact source guards now cover ten reviewed vendor modules.
There is no retained source/geometry cache, partial popup or additional dependency.
Normal reads, authorization, versions, command identity and durability are unchanged.

The popup also resets its native dialog's block-axis margin. The saved current
WebKit control resolves its automatic top/bottom margins to about 481 px, moving
the popup below its measured grid. A new measured-grid-bounds regression fails
that control before pointer input. Zero block margins preserve the native
measured positioning/height and correct the candidate's popup placement.
The scrollable list also reserves inline-end space so WebKit's scrollbar cannot
cover the native end-resize handle. An actual pointer-hit assertion detects the
covered handle before input; spacing restores that hit without changing native
gesture or conditional-write semantics. Row widths/wrapping follow the current
scroll-container width, with complete titles and membership retained.

## Diagnostic attribution

Three local and three constrained Chromium timeline traces bracket only the
current release popup action with user timing marks. Tracing stops before
membership/source verification. Category durations are interval unions on the
same main thread, clipped to those marks; nested categories overlap and cannot
be added. The constrained traced action spans 293.30–303.05 ms. FunctionCall is
246.83–267.56 ms inclusive, style update 32.54–33.58 ms, layout 35.25–38.85 ms,
PrePaint 9.66–10.59 ms and paint 3.10–3.76 ms. The first layout dirties 9,650
objects. Native insertion/component work remains material alongside layout.
These diagnostic spans are separate from quiet readiness measurements.

A block-layout CSS probe retains the complete list but establishes no useful
constrained improvement: 298.0 → 294.6 ms with overlapping 278–305/277–307 ms
ranges. Its patch is saved and the application CSS is restored.

## Quiet release comparisons

Apple M4, macOS 27, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12,
1440 × 1000. Seven rounds per implementation/profile/workload. Constrained
conditions emulate CPU ×4, 100 ms latency, 6 Mbps down and 1 Mbps up. Readiness
includes rendered content, two animation frames and settled ordinary API reads.
Builds, traces and browser/gate checks do not run concurrently with timing.

Adapter probes and retained-build popup opening median milliseconds:

| Workload | Local before | Local after | Constrained before | Constrained after |
| --- | ---: | ---: | ---: | ---: |
| 1,000 cards, whole-month plans | 97.3 | 69.0 | 298.2 | 243.0 |
| Whole-month quiet repeat | 88.4 | 70.2 | 294.8 | 238.8 |
| 37 cards | 31.1 | 31.7 | 28.8 | 27.5 |
| 1,000 cards, short plans | 83.9 | 81.4 | 292.3 | 239.5 |
| 1,000 cards, timed events | 84.0 | 80.3 | 312.4 | 266.9 |
| Final whole-month repeat with zero dialog margins | 86.9 | 69.9 | 299.5 | 246.4 |
| Retained whole-month build, margins and scrollbar spacing | 86.9 | 68.6 | 292.4 | 239.7 |

Earlier adapter probes precede the final margin/scrollbar fixes. The retained
whole-month build improves local opening by 18.3 ms and constrained opening by
52.7 ms, with constrained ranges 283.3–306.7 versus 232.6–246.1 ms. The earlier
dense constrained gain is 46–56 ms. The whole-month local gain repeats;
small/short/timed local differences do not establish a useful universal gain.
Cold/warm Calendar and editor readiness are broadly unchanged. Seven rounds
do not establish p95, physical iPhone, remote-network acceptance or a complete
performance ceiling.

All measured popups compare every ID, title and current version with the ordinary
Calendar API; opened source responses match the selected ID/version. All 784
selected timing samples retain 392 single-read Calendar openings, 196 popup
openings without API reads and 196 editor openings with exactly source/project/tags.

## Verification

Nineteen focused layout tests cover the reviewed native guards and fallback
boundaries. The full gate passes 269 Rust, 163 JavaScript and 12 Python tests:
444 total, plus types, format, boundaries, bundle and optimized release build.
Its first attempt stops at the Rust linker after exhausting disk space. Only
the disposable incremental compiler cache is removed; the full gate is rerun
successfully, retaining source data, evidence and saved release controls.

The native pointer scenario passes against the saved Chromium release control
and candidate. Before the final scrollbar spacing, natural popup row
height/width/title-height distributions match exactly at 1440, 390 and 320 px.
The final spacing intentionally narrows rows inside their scroll container;
their wrapping follows actual geometry. Candidate Chromium
calendar-layout, planning, events and calendar-popup checks pass; rendered
1440/320 px popup screenshots are inspected. All 26 Chromium regression suites
pass before the final scrollbar spacing; nine affected Chromium suites are rerun
successfully on the retained build. Nine affected WebKit suites, broad HTTPS
smoke and planning interactions also pass on that build. Final 1440/320 px
rendered screenshots are inspected. Initial WebKit gesture input exposes the
old popup-margin error and a test
that can scroll the document under its sticky header. The corrected test scrolls
the popup list, asserts that real gesture points hit the popup/calendar and waits
until the native handle receives pointer input after scrolling. Dates, source
versions, cancellation and mutation checks remain. The candidate passes the
complete WebKit popup scenario with no page errors. A later full run catches the
scrollbar-covered handle even after waiting for an actual pointer hit. Explicit
inline-end list spacing fixes that input obstruction; the retained scenario
passes. Additional WebKit responsive/header size and dialog/screenshot-CSP
failures reproduce in the saved current control. They remain separate open
acceptance limits; neither assertion nor CSP is relaxed.
Manual restart verification and ordinary report publication follow integration.
No physical-device result is claimed.

Bulk samples, traces, rejected patch, binaries and logs remain in ignored
`test-results/calendar-popup-rendering-2026-10-01/` and the reused immutable
`test-results/calendar-snippet-2026-10-01/baseline-bin/`.
