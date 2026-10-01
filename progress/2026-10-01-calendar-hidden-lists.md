# Calendar hidden-list accumulation

Starting revision: `584cc1cbf83a9ad14a16f9fce70d79c8b73cd621`.

The pinned month renderer previously copied a growing hidden list for every
new chunk/day and linearly searched it again on subsequent hide passes. A
pass-local collector uses one reference-membership set per day, copies each
changed list once and publishes it after collection. Original arrays remain
untouched; unchanged lists keep their identity and cause no map writes. The
ordinary upstream clear and fallback hide paths retain their behavior.

The guarded Vite transform still checks all five reviewed EventCalendar 5.12.2
source hashes and required modules. No npm file, dependency, API, page bound,
source read, request identity or durability rule changes. Native per-event
geometry, ordering, hidden DOM and full popup data remain. This does not reuse
guessed or cross-pass row heights from the rejected prior probes.

## Release measurements

Apple M4, macOS 27, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12,
1440 × 1000. Each row contains seven cold and seven warm navigations of a
registered synthetic 1,000-card fixture, with 995 dated items. Readiness includes
the rendered Calendar, two animation frames and settling ordinary API reads.
The constrained condition simulates 4× CPU slowdown, 100 ms latency, 6 Mbps
download and 1 Mbps upload. No builds or browser regressions run during quiet
comparisons. These small ranking runs do not establish p95, physical-device or
remote transport acceptance.

For the original dense three-day fixture, median milliseconds:

| Implementation | Local cold | Local warm | Constrained cold | Constrained warm |
| --- | ---: | ---: | ---: | ---: |
| Control | 201.7 | 159.7 | 1301.1 | 976.7 |
| Collector | 198.5 | 155.9 | 1280.6 | 964.9 |
| Repeat control | 199.9 | 161.3 | 1307.8 | 990.8 |
| Repeat collector | 198.6 | 155.0 | 1284.7 | 963.8 |

Warm medians improve by about 4–6 ms locally and 12–27 ms constrained. The
local sample ranges overlap, so this is a small gain rather than a guaranteed
per-navigation improvement.

For 963 added plans spanning September 1–30, each source participates in several
week rows. The 995 dated items produce 44,134 total page DOM elements in both
implementations. Median milliseconds:

| Implementation | Local cold | Local warm | Constrained cold | Constrained warm |
| --- | ---: | ---: | ---: | ---: |
| Collector, first run | 725.8 | 682.6 | 3213.3 | 2928.6 |
| Control | 760.9 | 719.8 | 3363.2 | 3119.4 |
| Collector, repeat | 720.0 | 741.2 | 3209.8 | 2943.3 |
| Repeat control | 756.3 | 764.5 | 3352.2 | 3103.7 |

Cold local readiness consistently improves by about 31–41 ms across these
controls; constrained readiness improves by about 139–154 ms cold and 160–191 ms
warm. Local warm results vary substantially in both implementations, with
overlapping ranges; no stable local warm readiness guarantee is claimed.
Raw long-task records show shorter main JavaScript work, but that observation
does not replace the elapsed readiness comparisons. Occasional second Calendar
reads and all recorded outliers remain in the samples.

## Verification and remaining work

Seven focused layout tests pass, including differential native list membership
and order, chunk reference identity, stable unchanged lists, retained previous
arrays and cleared generations. Release Chromium and WebKit pass
`calendar-layout`, `events`, `planning` and `calendar-pages`.

The layout suite now adds 330 source cards, including 30 whole-month plans. It
checks every day footer's hidden count against actual hidden grid spans, complete
item/popup membership, natural geometry, resize, zero geometry work on unchanged
refresh and keyboard opening with the current observed version. No application
page exceptions or CSP violations occur. Screenshots, raw samples, environment
records and source snapshots remain in ignored
`test-results/calendar-hidden-2026-10-01/`.

The full local gate passes 269 Rust, 142 JavaScript and 12 Python tests,
including the final frontend and release workspace build. Chromium desktop
popup and 390 px month-grid screenshots were inspected. Manual publication
verification is pending. Dense month-wide
rendering still takes roughly 0.7 seconds locally and 3 seconds constrained in
this fixture. Further DOM/layout work, other data distributions, concurrency,
physical devices and full release acceptance remain open.
