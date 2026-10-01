# Calendar main-grid DOM — 2026-10-01

Starting revision: `5e297a0` (deployed application/control `b1f9039`).
This checkpoint reduces dense month rendering. The broader performance objective
and release/product acceptance remain open.

## Change and retained behavior

The reviewed EventCalendar transform feeds the main keyed loop only visible
chunks and native representatives of reviewed equal-height snippet shapes.
Other hidden chunks no longer create inaccessible membership markers or reactive
child branches. Every native chunk model, its current projection metadata and its
positioning traversal remain intact. Sparse entries carry their original full
array index so representative references do not shift with visible membership.

Each pass still measures actual representative, header, cell and footer geometry,
calls the unchanged native positioning algorithm for every chunk and publishes
complete hidden-day lists. ResizeObserver/font/viewport changes get fresh
measurements. Unknown shapes, classes/styles or resources use the full native
renderer. Full day popups, backgrounds and interaction helpers are unchanged.

There is no API/source cache, pagination change, protocol change or relaxation of
source reads, observed versions, authorization, command identity, locks, fsync or
durability. Python remains tooling and optional Linux integration outside the
ordinary browser/Rust request path.

## Release measurements

Apple M4, macOS 27.0 arm64, Node 24.11.0, Rust 1.92.0 and Chromium
153.0.8010.12; 1440 × 1000. Seven cold and seven warm loads per group use
ordinary daemon/pairing and synthetic projects. Local and constrained profiles
run sequentially without concurrent builds, gates or browser suites. Constrained
settings are CPU ×4, 100 ms latency and 6/1 Mbps download/upload. Readiness includes
rendered DOM, two animation frames and observed ordinary API reads settling.
All raw samples, resource timings and outliers are retained.

The 1000-source-card September whole-month fixture gives these medians in ms:

| Profile | Cold before → after | Warm before → after |
| --- | ---: | ---: |
| Local | 261.2 → 99.8 | 214.4 → 60.3 |
| Constrained | 1554.1 → 945.6 | 1264.7 → 615.2 |

Live document elements fall from 10,338 to 679–682. All 56 opening samples issue
exactly one Calendar data GET. The largest observed long task in these groups
falls from 778 to 150 ms; this is an observed seven-sample range, not a universal
latency or tail guarantee. The remaining constrained cold time includes network,
bootstrap, event models and ordinary rendering.

Additional matched seven-sample opening medians in ms (before → after):

| Workload | Local cold | Local warm | Constrained cold | Constrained warm |
| --- | ---: | ---: | ---: | ---: |
| 37 source cards | 88.5 → 88.7 | 39.5 → 38.3 | 749.9 → 741.3 | 409.6 → 404.4 |
| 1000 short-plan source cards | 114.6 → 89.8 | 69.1 → 40.6 | 1006.5 → 875.2 | 683.4 → 543.2 |
| 1000 timed-event source cards | 115.3 → 89.7 | 70.5 → 54.6 | 1017.0 → 886.5 | 676.4 → 544.7 |

Small-fixture times are broadly unchanged. All 224 matched opening samples issue
exactly one Calendar data GET. Dense fixture source counts do not change the
existing 1000-item grid bound. Instrumented CPU/metrics profiles are diagnostic evidence,
not substitutes for the quiet release comparisons.

## Behavioral verification

A fixed-ID source fixture adds 330 timed, cross-week, whole-month and single-day
cards, including long Unicode titles. The control retains 589 main-grid chunk
nodes; the candidate retains 29. Across desktop, 390/320 px, large text and restored
text, visible event geometry matches within 0.02 CSS px, every footer count is
identical and every populated day's full popup order/title/membership is identical.
Every popup version is also checked against its own current ordinary API response.
Both Chromium and WebKit match all seven geometry states. An initial additional
WebKit probe captures aborted Focus requests while navigating the pairing page;
both control and candidate fail that setup. The repeat pairs in a separate context
and opens a fresh Calendar page, retaining the strict page-error assertion.
Both original failures and successful repeats remain in the evidence.

The maintained release regression independently reconstructs every API-projected
chunk from actual native representatives, including chunks without a main-grid
node, and compares natural heights. Hidden counts come from complete API day
membership minus actually visible events. Every checkpoint opens all populated
day popups and checks exact IDs, titles and observed versions; days without a
popup must show all their items visibly. Normal versioned CLI source updates,
unchanged refresh, large text, resize and keyboard editor opening remain covered.

Chromium and WebKit pass Calendar layout, events, Calendar pagination, planning,
loading and session suites. Focused layout tests pass 11 checks. The full gate passes 428 tests (269 Rust, 147 JavaScript and 12 Python),
including subprocess crash/recovery checks and the optimized release build.
Final Calendar layout repeats pass in both engines with all nine checkpoints,
589 independent natural-height probes and complete 362-item API membership
through 30 day popups per checkpoint. Manual integration evidence follows.

Desktop and 390 px Chromium screenshots were inspected. WebKit behavior/geometry
checks are real engine tests; screenshots are omitted under the application's
strict CSP. These are desktop engines/emulated viewports, not physical iPhone or
remote-owner acceptance. Broader performance and release acceptance remain open.

## Evidence

Ignored `test-results/calendar-layout-cpu-2026-10-01/` retains the explicit original
project context, starting control binaries/source, quiet samples, environment,
CPU/metrics diagnostics, exact geometry comparisons, screenshots and browser logs.
Detailed implementation notes stay outside `.project/`; the final result report
uses the normal CLI against the explicitly selected original project.
