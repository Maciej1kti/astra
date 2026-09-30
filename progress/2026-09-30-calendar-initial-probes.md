# Dense Calendar initial-rendering probes, 2026-09-30

Four further rendering candidates do not establish a useful, stable latency
improvement. All application, adapter and test changes are restored to `f6751ff`;
this checkpoint records measurements only. The owner's performance objective
and initial dense-grid work remain open.

## Quiet release comparison

The synthetic release fixture contains 1,000 source cards and 995 dated items.
Each run has seven cold and seven warm samples per condition, using fresh paired
Chromium contexts at 1440x1000. Readiness waits for Calendar content, two animation
frames and outstanding ordinary API reads. The same harness and source shape
are used throughout, with separate disposable source IDs. Runs are sequential,
without concurrent builds or heavy checks.

Environment: macOS 27.0, Apple M4/16 GiB, Chromium 153.0.8010.12. Constrained
emulation uses 4x CPU, 100 ms latency and 6/1 Mbps. Values below are medians;
seven samples do not establish p95, physical-device or remote-network acceptance.

| Run | Local cold | Local warm | Constrained cold | Constrained warm |
| --- | ---: | ---: | ---: | ---: |
| Current control | 200.0 ms | 171.1 ms | 1310.8 ms | 984.1 ms |
| Omit CSS-hidden detail children | 198.6 ms | 169.1 ms | 1306.8 ms | 975.0 ms |
| Event color classes | 199.3 ms | 153.9 ms | 1289.3 ms | 977.4 ms |
| Repeated current control | 203.2 ms | 167.4 ms | 1313.2 ms | 1036.9 ms |
| Repeated event color classes | 197.4 ms | 164.1 ms | 1291.9 ms | 968.1 ms |
| Classes plus lazy full-event arguments | 193.9 ms | 165.5 ms | 1285.6 ms | 999.6 ms |
| Pass-local equal-row height reuse | 199.5 ms | 165.4 ms | 1297.8 ms | 996.4 ms |

Current-control local warm ranges are 157.2–184.4 ms and 155.9–173.8 ms;
constrained warm ranges are 971.9–1029.5 ms and 979.9–1083.3 ms. The first
class-only run's local improvement is not stable in its repeat. Occasional
second Calendar reads in detail/class/lazy runs remain in their recorded samples;
they are not discarded. The equal-row run and both controls have one Calendar
read in every sample. No useful gain is inferred from operation counts alone.

## Candidates and attribution

Omitting details already hidden by month CSS removes about 2,002 DOM elements
(9,424–9,427 to 7,422–7,425), retaining item titles and full popup details. It
passes focused units/types and the release Chromium dense regression but changes
local warm median by only 2 ms. Its private popup context is removed.

Event classes replace two descendant `:has()` color selectors with ordinary
vendor classes derived from the same metadata. Complete DOM population remains.
Focused adapters/types and dense Chromium pass; repeat timing does not justify
retaining the new class allocation and styling path.

Lazy full-event arguments leave native date conversion available to consumers,
while Astra's snippet reads its raw metadata. Live getter units, types and dense
Chromium pass. The combined quiet result does not improve beyond the simpler
variant, so the additional adapter/plugin/snippet changes are removed.

Equal-row reuse reads one actual height per month-row kind within a synchronous
layout pass. It is restricted to an owned nonwrapping main grid; other elements
keep individual measurements. An independent geometry probe covers plans,
15/60/1500-minute events, milestones and long titles at 1440/1024/390/320 widths:
rows measure 44 px within 0.001 px floating-point variation. The dense Chromium
prototype reads two event heights while retaining all 439 week chunks, current
source versions, complete popups, resize and keyboard opening. Focused units and
types pass. Quiet timing still shows no meaningful gain; the helper, CSS marker,
plugin change and experimental browser assertions are restored.

Three separately instrumented current-control traces retain 9,427 elements.
Style updates total 104–145 ms and layout 52–60 ms under 4x CPU and profiling;
native geometry and garbage collection remain visible. Mapped `_cloneEvent`
self work is 11–13 ms. These instrumented totals are not quiet latency results
and overlapping trace categories are not added together. Hidden diagnostic
source maps stay outside production assets and are not published.

## Checkpoint and next work

The application remains the previously verified release; no manual restart or
prototype acceptance is claimed. The restored final tree passes documentation/
package validation and the full gate: 260 Rust, 139 JavaScript and 12 Python
tests, contracts, formatting, Svelte, clippy, bundle bounds and release builds.
The owner's existing uncommitted card edit is preserved separately.
The normal CLI appends and reads back project report
`88a282f4-fa44-42c4-a8e0-90b24b254e8e` with its committed source version.

Reducing populated event-component work would require broader geometry,
accessibility, popup, typography and interaction evidence. These rejected
micro-optimizations do not establish an irreducible lower bound. Current-source
tag scans, further Focus history distributions and durable-write pauses remain
separate measured candidates. Source authority, bounds and durability stay intact.

Ignored evidence: `test-results/calendar-initial-2026-09-30/`, containing full
sample arrays and environments, traces/maps, rejected patches, focused check
logs and real-daemon Chromium results. No acceptance requirement is removed.
