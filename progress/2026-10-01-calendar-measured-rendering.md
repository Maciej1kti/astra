# Measured Calendar month rendering — 2026-10-01

Starting revision: `f004904e7192174fb454585ca68c65983b12ceba` (application control
`e365ca6`). This checkpoint selects a measured rendering optimization. The full
performance objective and product/release acceptance remain open.

## Change and invariants

The month grid retains all native chunk models and positions them with the
unchanged native algorithm. It measures real components for reviewed equal-height
Astra snippet shapes and visible events. Most hidden interactive components become
small inaccessible membership markers; full popups and gesture previews remain
native. Grouping includes actual grid width/row, item kind, clock format length,
short-event class and editability. Unknown content, styles/classes or resources
use the full renderer. Every layout pass measures current geometry; retained
placements and observer notification baselines never replace those reads.

The six upstream source hashes and required-module guards include native chunk
positioning. npm sources are untouched. Sample-size notifications share one frame,
ignore unchanged initial CSS sizes and restore serialized fractional CSS values
to reviewed engine layout units only for notification comparison. Positioning
never uses rounded/guessed heights. This fixes a WebKit extra-pass regression
without relaxing the existing geometry-read assertions.

All 1000/200 page bounds, source IDs, versions, API reads, hidden counts, native
ordering and source reads before opening remain. Leaving measured rendering evicts
its placements. No protocol, source format, command, authorization, version check,
fsync or durability rule changes. Python remains tooling/optional Linux integration,
not the ordinary browser/Rust request path.

## Quiet release measurements

Apple M4, macOS 27.0, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12,
1440×1000. Each cell below is a median in milliseconds, control → final candidate,
with seven cold and seven warm navigations per profile. Constrained means CPU 4×,
100 ms latency, 6 Mbps download and 1 Mbps upload. No builds or browser suites ran
alongside these measurements. Readiness includes DOM readiness, two animation
frames and all ordinary API reads settling; CPU duration is not substituted for it.

| Fixture | Local cold | Local warm | Constrained cold | Constrained warm |
| --- | --- | --- | --- | --- |
| 37 source cards | 72.6 → 72.4 | 39.6 → 39.7 | 734.5 → 727.5 | 405.2 → 404 |
| 1000 shorter plans | 198.6 → 110.4 | 163.7 → 64.6 | 1291.7 → 976.5 | 986.9 → 646.1 |
| 1000 whole-month plans | 737.2 → 251.6 | 757.2 → 198.2 | 3226.6 → 1478.8 | 3008.9 → 1178.7 |
| 1000 varied-time events | 203.7 → 110.3 | 162.6 → 66.4 | 1334.2 → 984.1 | 1006.1 → 678.2 |

Controls and candidates repeat the large-plan gain: earlier whole-month cold
medians were 716.9/3197.9 ms versus 248.4/1463.6 ms; final cold medians above are
737.2/3226.6 versus 251.6/1478.8. Local warm final ranges are 687.8–813.8 ms in
control and 195.9–208.8 ms in candidate. The 1000-card fixtures return 995 items;
none are discarded to obtain these results. Whole-month DOM population falls from
44,134 to 10,338; shorter-plan population from about 9,424 to 2,557; varied-time
population from about 10,387 to 2,565. The small fixture is effectively unchanged
in median readiness; fewer elements alone are not claimed as a speed gain.

All samples and outliers are retained. Occasional second Calendar reads occur in
both versions. An earlier small candidate constrained warm sample was 539 ms with
two reads; its control maximum was 412 ms with one. Final small maxima are 411/412
ms. Dense candidate constrained warm outliers still reach about 977–1007 ms, and
whole-month about 1442 ms. Serial read scheduling, wider distributions, concurrency,
write paths and physical-device/transport limits remain work for the active goal.

## Verification

The final full gate passes 269 Rust, 146 JavaScript and 12 Python tests (427 total),
including frontend/contracts/boundaries, formatting, bundle limits, clippy and
release workspace builds. Eleven focused layout tests cover current identities,
shape separation, clock formats, native fallback and the prior pass-local helpers.

Four release suites (calendar-layout, events, planning, calendar-pages) pass in
Chromium and WebKit. The final strengthened Calendar suite is rerun after the
notification fix in both engines. It uses 330 added cards with varied hours/minutes,
cross-week and whole-month plans. Every hidden marker is independently reconstructed
from a full native element with its real title/time/duration/detail text and measured
at normal/large type, desktop, 390 and 320 px. Natural-height and footer-count
mismatches are empty; unchanged refresh performs zero geometry reads. Current
versions, complete popup membership and keyboard source opening pass.

A matched fixed-ID reference against the saved native release compares 589 chunks
at seven desktop/mobile/type checkpoints. Positions, sizes and hidden membership
match within 0.02 CSS px; exact footer counts match. Desktop popup/mobile grid
screenshots are inspected. WebKit is an emulator, not physical iPhone acceptance.

Bulk evidence is ignored in `test-results/calendar-chunk-2026-10-01/`: all raw timings, environment metadata,
baseline binaries/source snapshots, layout reference/comparison, browser results,
screenshots and final gate logs. Historical unsuccessful notification/geometry
prototypes remain labeled there; they are not acceptance claims.

## Integration

Manual rebuild/restart, trusted HTTPS/source preservation verification and normal
CLI result-report publication are pending at this source checkpoint.
