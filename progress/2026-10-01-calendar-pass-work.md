# Calendar pass-local capacity and date comparisons — 2026-10-01

Starting revision: `0539528` (deployed application/control `82bd0e9`).
The previous turn delivered verified sparse main-grid rendering. The broader
performance objective and release/product acceptance remain open.

## Change and invariants

A synchronous month reposition/hide pass now owns both its geometry reader and
its cell/span capacities. Repeated chunks use one current cell lookup and one
maximum-footer calculation for that shape. Actual native representative, header,
cell and footer heights still determine placement. Every subsequent pass creates
new readers/maps, including after source, footer, viewport or font changes.
Each check reads the chunk's current bottom; visibility itself is not cached.

The pinned renderer's intersection predicate reads current normalized Date
values with `getTime`, preserving native exclusive bounds and resource filtering.
Neither event dates nor query dates are retained as numeric snapshots, so normal
gesture/source mutations remain visible. The six exact upstream SHA guards and
required-module checks remain. Native ordering/positioning, every chunk model,
full popups, source versions, source reads and page bounds are retained.

This is browser work. Python remains tooling/optional Linux integration.
There is no API/protocol, source-format, authorization, command, lock, fsync or
durability change. No source/page-response cache is added.

## Release measurements

Apple M4, macOS 27.0 arm64, Node 24.11.0, Rust 1.92.0 and Chromium
153.0.8010.12; 1440 × 1000. Seven cold/warm loads and filter/clear actions per
group use normally paired synthetic projects. Local and constrained profiles
run sequentially without concurrent builds, gates or browser suites. Constrained
settings are CPU ×4, 100 ms latency and 6/1 Mbps download/upload. Readiness includes
rendered DOM, two animation frames and observed ordinary API reads settling.
All samples, resource timing and outliers remain in ignored evidence. Across
the final four workloads, all 224 opening samples issue one Calendar GET each,
and all 224 filter/clear actions issue zero planning GETs.

Matched final medians in ms (before → after):

| Workload | Local cold | Local warm | Constrained cold | Constrained warm |
| --- | ---: | ---: | ---: | ---: |
| 37 source cards | 74.6 → 72.5 | 39.5 → 39.4 | 726.0 → 729.9 | 401.4 → 403.2 |
| 1000 short-plan source cards | 90.0 → 90.1 | 39.5 → 39.2 | 865.4 → 847.2 | 538.8 → 528.0 |
| 1000 timed-event source cards | 89.2 → 90.1 | 54.8 → 37.9 | 868.6 → 853.7 | 544.2 → 530.6 |
| 1000 whole-month source cards | 98.5 → 92.6 | 58.0 → 50.1 | 927.1 → 899.9 | 600.7 → 578.6 |

Whole-month constrained clearing of the local title filter improves from 144.9
to 96.9 ms (observed ranges 124.8–145.4 and 94.6–112.2). Local whole-month clearing
is unchanged at about 47 ms. Small-fixture and filtering times remain broadly
unchanged; short/timed local warm/clear groups can land on a different animation
frame and do not establish a universal stable 17 ms gain. The dense constrained
opening gain is modest, rather than a claim that the view is instantaneous.

A quiet seven-sample whole-month repeat after the full gate confirms constrained
clearing at 128.6 → 96.4 ms, with nonoverlapping observed ranges 126.0–144.8 and
93.0–111.2. Warm opening repeats at 601.7 → 579.6 ms; local warm 58.9 → 49.7 ms.
The controls differ by about one animation frame between batches, so the retained
results support a 32–48 ms constrained clear improvement, not a universal 48 ms
claim. Repeat opening/action request counts remain one/zero respectively.

Initial isolated capacity and direct-numeric prototypes retain their own samples:
whole-month constrained warm 604.3 → 585.8 → 576.9 ms. Final helper ownership and
all workload comparisons use the final candidate build and a fresh saved-current
control. Instrumented CPU/metrics evidence is diagnostic, separate from quiet
comparisons. The CPU session crossing navigation retains the last document's
profile; its elapsed span is checked before attributing it to warm rendering.

## Verification

Five new regressions compare pass-local capacity to native footer traversal,
check zero-height reuse, current bottom values, fresh resized/footer geometry,
grid-edge truncation and exact fits. Numeric predicate cases compare the native
Date/resource oracle across boundaries, zero-duration, timezone-offset instants,
invalid dates and current Date/resource mutations. The focused layout suite
passes 16 tests. The full gate passes 433 tests (269 Rust, 152 JavaScript and
12 Python), including subprocess crash/recovery and the optimized release build.

Calendar layout, events, pagination, planning and session pass in Chromium and
WebKit. The initial Chromium loading check assumes a changed hidden item has a
main-grid node; it fails identically in three saved-current control runs. The
corrected check exposes the item through the loaded-title filter and also checks
the exact DOM source version; final loading passes in both engines. All original
failures and repeats are retained.

Separate fixed-ID comparisons match every mounted chunk's geometry within
0.02 CSS px, every footer count and every populated day's popup order/content
in both engines across seven desktop/mobile/large-text/restored states. All
popup versions are checked against their current source projections. Desktop and
390 px Chromium screenshots were inspected. WebKit uses actual behavior/geometry
checks without screenshot preparation under the application's strict CSP.

Desktop engines and emulated viewports do not prove physical iPhone or remote
owner acceptance. No card status, priority, scope, dates or acceptance is changed.

## Evidence

Ignored `test-results/calendar-remaining-2026-10-01/` retains the explicit original
project context, starting release binaries/source, CPU/metrics profiles, all
prototype/final samples and behavioral verification. Detailed notes stay outside
`.project/`; the final result report uses the normal CLI against the explicitly
selected original project.
