# Editor reads overlap modal rendering

Starting revision: `811de9a5015d83ced720cbfcce47f3e03c35f4cc`; its application
implementation is `cebdc2b50f6082a7eb237dea7dc9171038e79044`.
The broad performance objective and release acceptance remain open.

## Selected change

Opening an existing resource still reads its current source before creating an
editor. The editor starts its ordinary project and card-tag requests before
native modal layout, allowing network work to overlap rendering. Its opening tag
request is consumed once by the Labels catalog. Subsequent invalidations, retries
and session restoration make fresh requests; editor instances do not share a
retained catalog or source response. Project-name publication is guarded against
disposed components and lost access.

Only these editor context reads opt into synchronous transport startup when a
GET pool slot is available. Default reads retain their microtask cancellation
window. The pool installs its shared response and subscriber ownership before
transport can reenter or cancel. Its three-active/32-queued bounds, deadline,
subscriber cancellation, same-key sharing and FIFO queue behavior remain.
Authentication, source versions, API/protocol, command identity, conditional
writes and durability are unchanged. No calendar vendor source or layout changes
are selected in this iteration.

## Quiet release measurements

Apple M4, macOS 27, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12,
1440 × 1000. Each workload has seven rounds per implementation and profile.
The constrained profile emulates CPU ×4, 100 ms latency, 6 Mbps download and
1 Mbps upload. Each round navigates cold/warm, opens a complete native day popup,
then opens a card from that popup. Readiness includes rendered content, two
animation frames and settling ordinary API reads. Builds, browser regressions and
CPU profiling finish before these quiet comparisons. Seven samples do not
establish p95 or physical-device/remote-network acceptance.

Editor opening median milliseconds:

| Workload | Local before | Local after | Constrained before | Constrained after |
| --- | ---: | ---: | ---: | ---: |
| 37 cards | 71.7 | 30.3 | 432.7 | 367.9 |
| 1,000 cards, short plans | 93.1 | 91.8 | 344.7 | 265.6 |
| 1,000 cards, timed events | 110.8 | 82.9 | 344.3 | 262.7 |
| 1,000 cards, whole-month plans | 94.5 | 90.3 | 344.1 | 264.7 |

The constrained gain is 65–82 ms. Local results depend on frame timing and read
completion; the short/whole-month local differences are small. Small-fixture
opening can still include the editor's deferred import, unlike the longer dense
popup interaction that gives its existing warm-up more time. Workloads should be
compared against their matched control, not against one another.

A quiet seven-round repeat confirms the constrained improvement: 37-card editor
opening is 446.7 → 375.5 ms, and whole-month opening is 345.1 → 273.6 ms.
Small-fixture local opening repeats at 73.5 → 30.6 ms (ranges 70.6–75.7 versus
29.3–33.3). Whole-month local opening is more variable: its repeat is
103.6 → 71.1 ms, versus the small initial difference. The constrained repeat gain
is about 71–72 ms; no universal local whole-month gain is claimed.

All 224 cold/warm openings retain one Calendar GET. All 112 popup openings issue
zero API reads. All 112 editor openings issue exactly three API reads, including
the current source, project and project tags. Every measured source response is
checked against the selected item's version/ID; complete popup IDs, titles and
versions are checked against the normal Calendar API. Initial Calendar readiness
and popup creation are broadly unchanged. Large popups still mount the full native
list; their rendering cost remains further work.
The repeat adds 112 Calendar openings, 56 popup openings and 56 source openings,
with the same read/identity checks: combined totals are 336, 168 and 168.

## Rejected probes and verification

Hoisting day-popup state reads and direct numeric chunk clipping do not establish
a stable useful constrained gain. Both are restored; their patches, quiet samples
and the clipping oracle checks remain in ignored evidence.

An eager default GET prototype improves editor timing but reproducibly starts an
obsolete Calendar range request during agenda-to-grid switching. The existing
`calendar-pages` scenario then encounters a cancelled response body. The selected
opt-in mode preserves default cancellation; that same unmodified scenario passes
in Chromium and WebKit. No timeout, response assertion or page bound is relaxed.

Eight new read-pool regressions cover opt-in startup, default cancellation,
reentrant sharing/cancellation, synchronous failure, concurrency and deadlines.
The original pool fails the startup regression; the selected pool passes all
twelve focused checks. Early probe logs include a test-harness unhandled-rejection
failure, corrected by attaching the expected rejection handler before cancellation;
the final saved-control run has only the expected startup failure.

The new `editor-opening` suite checks fresh resource versions and single project/tag
reads before modal layout. It holds an ordinary tag response, performs a conditional
CLI label change, then releases the old response after newer suggestions appear.
The old catalog cannot replace current tags or change the opened source. Its
saved-current control fails the opening-order assertion; the candidate passes
in both engines.

The final full gate passes 269 Rust, 160 JavaScript and 12 Python tests: 441 total,
including crash/recovery checks and the optimized release build. All 25 Chromium
regression suites, nine distinct affected WebKit suites, broad HTTPS smoke and
planning interactions pass. Desktop editor/suggestions screenshots are inspected;
WebKit uses behavior checks without screenshot injection. This does not establish
physical iPhone, Arch/ext4, remote CI or complete performance acceptance.

## Manual application and publication

The existing manual application's rebuild, restart and trusted HTTPS/asset/data
verification are pending at this branch checkpoint. A normal report to the
explicitly selected original project and publication follow that verification.
The owner's unrelated card remains unchanged.

Bulk logs, profiles, matrices, saved-control failures, screenshots and read-count
checks are retained in ignored `test-results/calendar-interactions-2026-10-01/`.
