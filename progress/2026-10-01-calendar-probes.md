# Calendar geometry and query probes

Starting revision: `3bf73f2f1da784c7bc52b5aa3278e6384b2932b3`; the application
implementation is unchanged from `009bb27b00cd0456286641f5133d84d5d37be6ab`.
No application prototype from this checkpoint is selected.

## Quiet release rendering

Apple M4, macOS 27, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12,
1440 × 1000. Each condition has seven cold and seven warm navigations with
1,000 registered synthetic cards and 995 dated items. Readiness includes the
rendered Calendar, two animation frames and settling ordinary API reads.
The constrained condition simulates 4× CPU slowdown, 100 ms latency, 6 Mbps
download and 1 Mbps upload. Builds, browser regressions and CPU traces run
separately from these quiet comparisons. This is not physical-device or remote
transport acceptance, and seven samples do not establish p95.

Median milliseconds:

| Implementation | Local cold | Local warm | Constrained cold | Constrained warm |
| --- | ---: | ---: | ---: | ---: |
| Control | 201.6 | 168.3 | 1303.1 | 1020.9 |
| Remove normal initial header reads | 209.9 | 170.6 | 1329.8 | 1058.9 |
| Automatic content visibility | 188.2 | 153.4 | 1254.8 | 946.9 |
| Repeat control | 204.0 | 166.1 | 1303.5 | 1009.1 |
| Repeat automatic content visibility | 190.6 | 158.0 | 1255.5 | 931.9 |
| Layout/style/paint containment | 202.2 | 169.7 | 1297.2 | 994.1 |

The normal initial EventCalendar header effect sits outside the existing
pass-local geometry reader. Three separate instrumented traces attribute
57–69 ms of sampled self time under 4× slowdown to its geometry-read path.
Removing that effect for ordinary events retains helper reads and reduces
operation counts, but the quiet elapsed-time comparison regresses. Restored.

Automatic content visibility keeps all event nodes and complete popup data,
using the existing 36 px content minimum as skipped content's intrinsic block
size. The warm gain repeats: 8–15 ms locally and 74–77 ms constrained. Default
geometry and existing Chromium/WebKit interactions pass. However, an independent
controlled typography probe at 1440, 390 and 320 px finds skipped rows reserved
at 44 px while full rendering requires 67–139 px after enlarging the text tokens
to 48/42 px. The remembered-size `auto` variant also retains incorrect skipped
heights. These are artificial CSS overrides, not a physical text-zoom test or a
claim about a defect in the deployed renderer. Both prototypes are restored
because they introduce a height assumption that the current renderer avoids.

Layout/style/paint containment retains full natural sizing and passes the same
geometry probe, but does not establish a useful stable readiness improvement.
Its local warm result remains within the control range, and the constrained
warm range is 979–1062 ms. Restored.

The main fixture still creates about 9,424 DOM elements. API reads remain
ordinary and bounded, including occasional second reads; none are discarded
from the samples. Source freshness, observed versions, popup membership,
request identity and command durability are unchanged.

## Release Rust query

A separate normally registered Engine fixture contains 100 projects,
10,000 cards, 1,000 milestones and 50,000 note reports. Cards include date plans,
civil-time events, out-of-range plans and unscheduled/archived resources.
Each case uses 20 warmups and 200 measured reads. Every response is compared
with the original query's ordered items, versions, event fields, has-more flag,
freshness and warnings; later-page reads retain the original cursor.

| Case | Control median / p95 ms | Early entity-type filter median / p95 ms |
| --- | ---: | ---: |
| Global, 1000 items | 14.25 / 14.69 | 14.52 / 15.02 |
| One project, 55 items | 0.77 / 0.79 | 0.80 / 0.81 |
| Global, 200 items | 13.12 / 13.49 | 13.33 / 13.84 |
| Global, empty period | 10.29 / 10.69 | 10.47 / 10.84 |
| Global, second 200-item page | 13.26 / 15.63 | 13.44 / 15.51 |

Adding the common `card`/`milestone` restriction to the reused `selected` CTE
does not improve elapsed time. The original query plan already pushes branch
restrictions into scans of `documents_schedule_end` and
`documents_milestone_due`, followed by a temporary ordering tree; it does not
materialize the unrelated report collection. The extra condition is restored.
Engine timings exclude HTTP, compression, network and browser work. Peak RSS
includes registration, fixture creation and indexing, not steady-state daemon
memory.

## Verification and remaining work

The header and containment prototypes pass release Chromium `calendar-layout`,
`events` and `planning`; automatic content visibility passes the same suites in
Chromium and WebKit. Chromium desktop/month and narrow grid screenshots were
inspected. The geometry probe preserves all 339 main-grid chunks at each tested
width; full results and rejected patches are retained in ignored
`test-results/calendar-profile-2026-10-01/`.

All application sources are restored. The full local gate passes 269 Rust,
139 JavaScript and 12 Python tests, including the restored embedded frontend
and release workspace build. Incremental compilation was disabled for this
gate after reclaiming this worktree's generated application build artifacts;
no checks or durability settings were weakened. The normal CLI report
`80c8b849-1adb-434d-9638-9030d7db12d5` is durably committed and read back with
the same version and body; the owner's existing card is unchanged. No manual
application restart is required for these rejected probes. Broader rendering
work, data distributions, concurrent
reads/writes, physical devices and full release acceptance remain open. A larger
Calendar improvement needs a measured reduction in widget work while retaining
real geometry and complete popup/source behavior.
