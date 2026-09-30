# Calendar rendering performance, 2026-09-30

The owner requested continued methodical optimization until further improvements
are imperceptible. This is one measured iteration; the overall objective remains
open. It preserves all calendar items, pages, gestures and observed versions.

## Diagnosis and change

Chromium CPU/trace profiles with offline source maps identify repeated
`getBoundingClientRect`, unused event-time `Intl.formatRange` and day-grid array
copies. Diagnostic maps were kept in ignored evidence, with normal production
assets rebuilt before embedding the daemon. Python is outside this rendering
path; the server remains Rust and the browser remains Svelte/TypeScript.

The reviewed EventCalendar 5.12.2 build transform measures each element once per
synchronous layout pass, keeps unused time/view snippet details lazy and appends
chunks without repeatedly copying the accumulated array. Dependency source hashes
and required-module checks fail the build when the reviewed assumptions change.
See [ADR-054](../docs/ADR-054-CALENDAR-RENDERING.md).

## Release measurements

macOS 27, Apple M4/16 GiB, Node 24.11.0, Rust 1.92.0 and Chromium 153.0.8010.12.
The disposable fixture has three projects, 1,000 cards and 995 dated items.
Desktop viewport is 1440 × 1000. Each condition has five cold/warm samples;
constrained runs emulate 100 ms latency, 6 Mbps download, 1 Mbps upload and 4× CPU
slowdown. All app access uses ordinary pairing and release binaries.

| Readiness median | Unmodified `ae3ceab` | Geometry only | Geometry + lazy details + append |
| --- | ---: | ---: | ---: |
| Local cold | 216.5 ms | 216.9 ms | 202.8 ms |
| Local warm | 178.3 ms | 180.5 ms | 161.1 ms |
| Constrained cold | 1384.7 ms | 1365.3 ms | 1307.0 ms |
| Constrained warm | 1076.2 ms | 1033.0 ms | 988.2 ms |

The combined prototype improves constrained warm readiness by about 8%. Geometry
alone has no demonstrated local improvement. Ranges and individual samples are
retained, including a 348 ms local cold outlier and a repeated-read warm baseline
outlier. This is a median comparison, not p95 acceptance or an actual phone/VPN
measurement. The prototype comparison ran in a separate worktree, keeping
concurrent modal work out of its before/after application code.

A final five-sample comparison includes the completed modal changes at `c6354df`
and the clock-retention correction on both sides. Only the calendar transform
is disabled for the control:

| Readiness median | Current control | Verified optimization |
| --- | ---: | ---: |
| Local cold | 229.4 ms | 202.8 ms |
| Local warm | 189.7 ms | 159.6 ms |
| Constrained cold | 1378.3 ms | 1314.0 ms |
| Constrained warm | 1064.2 ms | 972.1 ms |

Warm medians improve by about 16% locally and 9% under emulation. An optimized
constrained warm sample performs two Calendar reads and takes 1565.6 ms;
it remains in the evidence. Whole-page element counts range from 7336 to 7339.
Repeated reads, refresh rendering and the large item population remain candidates;
this result does not claim identical full-page transient states or p95 acceptance.

The instrumented regression with 300 extra cards reduces cell reads from 1,317
to 48 and footer reads from 2,676 to 51. Unused time-range formats fall from 439 to
zero. It retains all 439 rendered chunks, including 431 hidden chunks and complete
accessible popup contents. Shrinking to 1024 × 640 hides the remaining month-cell
entries behind their complete popups; growing back restores the visible layout.
The unmodified renderer fails the new geometry-read bound. These counts are
separate from uninstrumented timing measurements.

## Verification and remaining work

The initial isolated full gate passes 249 Rust, 123 JavaScript and 12 Python tests.
Broad release HTTPS/planning checks and all 22 Chromium regression suites pass.
WebKit loading, session, planning, calendar-pages, calendar-layout and events pass,
including strict CSP assertions.

Integration with the completed Focus counters and card calendar at `8bd35b9`
passes the full gate with 251 Rust, 129 JavaScript and 12 Python tests. Broad
HTTPS/planning and 23 of 24 Chromium suites pass on the first run. Comments fails
because its Focus entry selector assumes the former metadata markup; a focused
rerun with the correct card entry passes, retaining history, uncertain-command
and conflict checks. Eight affected WebKit suites pass. The subsequent unified
card-layout change at `16a6935` independently corrects that selector and passes
its full gate and affected browser suites, as recorded in
[its evidence](2026-09-30-unified-card-sections.md).

The combined release frontend and daemon at `16a6935`, including this optimization,
were rebuilt and the existing manual application restarted. Its restart evidence
preserves all 31 pre-existing resource versions, two pins, preferences and the
certificate. A subsequent trusted-certificate check at
`https://100.122.250.14:47832` verifies all 33 embedded assets against the current
production build, with no diagnostic maps. At that later check there are 32
resources: one report was added and one known owner-edited card has a newer
version. The other 30 earlier versions, pins, preferences and certificate match;
the owner's edits are retained and are not treated as restart mutations.

The broad HTTPS run also exposed a reproducible retained-editor exception after
session revocation. Its failing regression and correction are described in
[the clock-context evidence](2026-09-30-session-clock-retention.md).

The 1,000-card month grid still creates thousands of elements. Dense overlap
publication and initial header measurements remain candidates. Durable creation
also remains above the recorded 150 ms target. No requirement or acceptance
status is changed by this result.

Ignored evidence is in `test-results/calendar-rendering-2026-09-30/`: diagnostic
profiles/traces/maps, `baseline-isolated`, `height-cache`, `lazy-chunks`, the
dense-layout regression, its unmodified negative control and build/check logs.
Final evidence adds `current-baseline`, `current-optimized`, `current-coverage.json`,
`verified-full-gate.log`, `verified-chromium`, `verified-webkit` and the before/after
session regression. Integrated checks are in `integration-full-gate.log`,
`integration-chromium`, `integration-comments`, `integration-webkit` and
`manual-verification.json`. These results use isolated builds; concurrent source
work is preserved separately.
