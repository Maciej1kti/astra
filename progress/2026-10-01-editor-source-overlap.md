# Editor source and context read scheduling

Starting revision: `b4f86ce07dea864746713a04715b76b39a9bcd90`; its application
implementation is `44ebb0f38bbf543c347b89dd0fefe017ed19f7ed`.
Broader performance and release acceptance remain open.

## Selected behavior

An actual existing-resource opening starts its authoritative source transport
first, followed by fresh project and card-tag transports in the existing bounded
GET pool. The editor still requires a successful current source before appearing.
The resulting target owns the context reads; each is consumed once. New drafts
retain their ordinary reads before modal rendering. Other requests keep their
default microtask cancellation window; no transient Calendar read is made eager.

Navigation owns the pending generation and abort signal. A superseded opening or
failed source cancels its context. Cancellation after source resolution but
before mounting also removes the unconsumed context and listener. Replacing or
closing a target, session loss and disposal release its remaining reads. A
delivered editor retains its context independently of subsequent view-generation
changes. Command identity, source versions, conditional writes, authorization,
prepare/write/commit durability, three-active/32-queued bounds and deadlines remain.

Until Labels consumes the opening catalog, tag invalidation discards that catalog
without cancelling the source. Labels then makes a fresh ordinary read. At
handoff, its existing generation checks own later invalidation, retries and
session restoration. No source response or catalog is cached across openings.

## Quiet release comparison

Apple M4, macOS 27, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12,
1440 × 1000. Seven rounds per implementation/profile/workload, followed by a
matched quiet repeat. The constrained profile emulates CPU ×4, 100 ms latency,
6 Mbps download and 1 Mbps upload. Rendered readiness requires description
content and two animation frames; complete readiness also waits for ordinary API
reads. Builds, gate checks and browser regressions finish outside these timings.
These markers do not establish physical-device perception or p95.

Complete editor readiness median milliseconds:

| Workload | Local before | Local after | Constrained before | Constrained after |
| --- | ---: | ---: | ---: | ---: |
| 37 cards | 31.1 | 30.3 | 376.5 | 292.5 |
| 1,000 cards, whole-month plans | 90.8 | 89.7 | 269.4 | 248.4 |
| 37 cards, quiet repeat | 30.0 | 30.2 | 372.9 | 285.6 |
| Whole-month quiet repeat | 88.9 | 89.6 | 265.7 | 246.7 |

The constrained complete-readiness gain repeats at 84–87 ms for the small fixture
and 19–21 ms for the dense fixture. Local complete readiness is broadly unchanged.
Dense local rendered readiness remains about 30 ms: 30.4 → 30.3 initially and
30.7 → 30.0 in the repeat. Constrained rendered readiness improves from
310.4 → 292.5 / 303.0 → 285.6 on the small fixture and
217.7 → 207.8 / 220.7 → 211.4 on the dense fixture. The small fixture may still
include deferred editor code; its result is compared only with its matched
control. Calendar readiness and popup timings are broadly unchanged.

All 448 selected timing samples retain their ordinary reads: 224 Calendar
openings with one planning GET, 112 complete popup openings with zero API reads
and 112 editor openings with exactly the current source, project and tags. Every
source ID/version and complete popup ID/title/version set is checked against
ordinary API data. Recorded selected resource timings additionally assert that
the source transport starts before optional context. Seven-round samples do not
establish a universal latency or a complete performance ceiling.

## Rejected intermediate behavior

The first overlap prototype keeps the source's default microtask startup while
making context immediate. Its constrained complete readiness improves, but the
dense local rendered marker regresses from about 30 to 75 ms. Actual resource
timings show the tag scan sometimes reaches the server before the source and
delays it. A failing transport-order regression precedes the selected explicit
source-first startup. The selected release preserves rendered readiness while
retaining the smaller, repeatable complete-readiness gain. The earlier larger
constrained gains do not describe the retained implementation.

An initial invalidation listener also cancels a catalog already handed to Labels.
The existing delayed-response browser oracle catches that ownership error. The
selected listener detaches only when Labels takes the catalog, preserving its
unchanged stale-response scenario. An early unit oracle incorrectly expects the
already completed failed-source transport to be aborted; the corrected assertion
requires cancellation of both still-pending context transports and the original
source failure. No behavior bound or stale-response assertion is relaxed.

## Verification and publication

The original release fails the held-source overlap regression. The original
navigation owner fails the added cancellation assertions. Seven focused opening
tests cover source-first overlap, one-time consumption, source failure,
supersession, cancellation before/after source resolution, pre-editor tag
invalidation and relevant context by resource type. Navigation tests cover actual
abort ownership, history restoration, obsolete failures and delivered-context
lifetime. Existing read-pool tests retain concurrency, sharing, deadlines and
default cancellation coverage.

The final full gate passes 269 Rust, 171 JavaScript and 12 Python tests: 452 total,
plus types, format, boundaries, bundle and optimized release build. All 26
Chromium suites and 12 affected WebKit suites pass, including corrected fixture
reruns, with broad HTTPS and planning interactions passing separately. Actual
desktop suggestions and 320 px event-editor screenshots are inspected. Existing
WebKit header-size and screenshot/CSP limits from the preceding iteration remain
open; these selected suites do not establish physical iPhone or full release
acceptance.

The first full browser runs each have one late-opening failure: the old fixture
waits for a completed response after native cancellation has already stopped it.
That scenario now deliberately makes only its held source transport nonabortable,
preserving every original response-finished and destination/no-editor assertion.
A separate ordinary browser scenario holds all three real opening responses,
switches view and requires three actual request failures and three transport abort
signals before releasing them. The source version and destination stay intact,
and no editor appears. Both scenarios pass in both engines. The other 25 Chromium
and 11 WebKit suites already pass their initial full runs. Test-only corrections
do not change the measured application. Source-order control cleanup is corrected
to settle cancellation before removing the fixture window; its final saved
prototype run has only the expected source-order failure.

Bulk saved controls, profiles, failed/selected logs and rendered screenshots remain
in ignored `test-results/editor-source-overlap-2026-10-01/`.

## Manual application and project report

Application commit `186b2f8d70287dd769d1682bb230ba9b665af6f4` is integrated into
the original checkout. Its embedded frontend and release daemon are rebuilt.
The existing manual launcher restarts from PID 27572 to 64674 with the same data,
connection settings and certificate. Before/after snapshots preserve all 67
prior resource versions, two pins and preferences. Trusted HTTPS at
`https://100.122.250.14:47832` verifies every one of the 32 served assets against
the rebuilt frontend. The owner's unrelated card SHA remains
`d79037cd72f3a1258c525cbce6056f42c2e8710a7f8340d1fb2c506bf485da9b`.

The ordinary CLI report addresses the explicitly selected original project.
Its identity, epoch and unchanged payload are saved before submission; the
committed result is read back with the exact body and version. Report ID:
`7d6d2c0d-70c2-4000-958b-73450748af82`; request ID:
`01a0f6c1-fd8e-7c02-a8de-f97c2e7648aa`; epoch:
`cb999e35-b0ac-40ee-b223-9a9c6c1b0b4a`; version:
`r1.6e1b964fdd6381178aad6337e03dce8dc7c06ed6c4782924cb10475e9afd8b8d`.
The report does not change scope, priority, deadlines, focus or card acceptance.
Broader performance and physical-device/release acceptance remain open.
