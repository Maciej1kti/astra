# Calendar refresh performance, 2026-09-30

The owner's continuing performance objective remains open. This iteration targets
work after an ordinary read returns the same calendar page, following
[the geometry/formatting iteration](2026-09-30-calendar-rendering.md).

## Diagnosis and change

Every accepted read supplied fresh event objects and a fresh event array, even
when all source versions and projection data were identical. EventCalendar then
normalized and laid out the entire page again. A diagnostic 1,000-card refresh
performs 2,147 geometry reads, including 1,017 day-header measurements.

The view now owns a bounded event projection for its displayed page. It retains
widget identities only when all source/projection fields and effective
editability agree. Order and membership still replace the array. Changes to
versions, titles, dates or timed metadata replace affected inputs. Typed exhaustive
field sets require review if the contract expands; owned metadata snapshots
protect against caller mutation. Removed/filtered entries are evicted.

The application still performs the ordinary authenticated read. Request
generation, cancellation, gesture guards, pagination, loading/freshness/error
publication, current-source opening and conditional commands are unchanged.
There is no source-response cache or reduction in the 1,000/200 item bounds.

## Release measurement

Baseline frontend: `16a6935`, plus documentation-only `72dda69`. macOS 27,
Apple M4/16 GiB, Node 24.11.0, Rust 1.92.0 and Chromium 153.0.8010.12.
Both release builds use three disposable projects, 1,000 cards and 995 dated
items. Each condition has one paired 1440 × 1000 context per profile and seven
consecutive explicit refreshes after startup reads settle. Constrained runs
emulate 100 ms latency, 6 Mbps download, 1 Mbps upload and 4× CPU slowdown.

| Unchanged-page refresh | Control median (range) | Optimization median (range) |
| --- | ---: | ---: |
| Local | 155.0 ms (138.6–162.9) | 36.9 ms (25.2–42.8) |
| Constrained | 878.7 ms (824.0–903.4) | 351.7 ms (342.5–359.1) |

Warm no-change refresh medians improve by about 76% locally and 60% under
emulation. Every timing sample still makes one Calendar read and retains all
995 items. The 14 control samples contain 14 observed long tasks; the 14 optimized
samples contain none. Separate instrumented refreshes show geometry reads falling
from 2,147 to zero. Instrumentation is excluded from the timing comparison.

This measures refresh of identical data, not cold startup, changed-data rendering,
physical devices, VPN latency or p95 acceptance. The 1,000-item initial grid and
changed-page widget normalization remain substantial costs. The durable-write
target also remains open.

## Verification

Unit regressions cover equivalent fresh reads/filters, newer observed versions,
changed projection dates/titles, timed metadata, caller mutation, readiness,
order, membership and page eviction. The release dense-layout browser check
retains all 439 chunks and complete popups, requires zero geometry reads after
an unchanged read, and publishes a real conditional CLI title change with its
new source version. Shrink/grow layout and keyboard opening still pass.

The first extension of that browser test incorrectly placed `title` at the patch
root. Normal server validation rejected it. The fixture now uses the documented
`set.title` command and the full scenario passes; validation was not relaxed.

The negative control with ordinary event reconstruction fails the new no-change
refresh guard with 455 header reads instead of zero. Its temporary source change
is restored before final verification. The control script initially expected a
checkpoint name in the assertion text; the retained log and structured result
confirm the intended geometry assertion, rather than another test failure.

Integration with the completed compact-counter changes at `efefa7a` passes the
full gate: 251 Rust, 137 JavaScript and 12 Python tests, schemas/contracts, Svelte,
boundaries, formatting, Clippy and production bundle checks. Broad release
HTTPS/planning checks, seven Chromium suites and six WebKit suites pass. These
cover loading, session recovery, planning, calendar pages/layout and events;
Chromium additionally covers protocol cursor recovery. Strict CSP, actual
gestures, observed versions and uncertain conditional-command checks remain.
Manual restart verification is pending at this checkpoint. No requirement,
scope or acceptance status changes.

Ignored evidence is under `test-results/calendar-rendering-2026-09-30/`:
`refresh-baseline`, `refresh-optimized`, `refresh-coverage.json`,
`refresh-regression`, `refresh-regression-diagnosis`, `refresh-regression-fixed`
and the negative control. Physical profiling/build scripts and logs are kept in
the isolated worktree's ignored `test-results/calendar-isolated/`; copies of the
refresh profile and final build/check logs are retained with the ignored evidence.
