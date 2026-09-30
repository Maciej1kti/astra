# Bounded ordered tag reads, 2026-09-30

Current-source tag catalogs and workspace rename previews now use up to four
scoped readers at 64 readable files, under the existing nonblocking source-read
capacity guard. Smaller scans and contention keep the ordinary sequential path.
Strict source collections retain their 256-file threshold. Projects remain
sequential; the caller keeps its workspace gate, project lock and guarded reader.

Capacity-one channels preserve the sorted visit order while bounding queued and
current results to two per worker plus the consumer: nine at four workers.
The tolerant scan does not retain a complete parsed collection. Failed starts
read that partition on the caller. Early visitor failure closes receivers before
joining; worker panic becomes a private invariant error after all producers end.

Every readable file keeps current lease/path/type/link/size/schema checks and its
exact byte version. Invalid identifiers still count toward the 50,000-file budget
and appear in the same issue order, but avoid worker dispatch. Literal labels,
archived sources, 500 detailed issues/omissions and 500 preview proposals remain
unchanged. No index/source cache, API field, conflict exception or durable-write
change is introduced. See [ADR-055](../docs/ADR-055-BOUNDED-SOURCE-READS.md).

## Release measurements

macOS 27.0, Apple M4/16 GiB, local SSD, Rust 1.92.0 release Engine. Control is
`c8823bc`. Each compared executable uses the same temporary benchmark source,
source shape, validation and count assertions; fixtures have separate disposable
IDs. Runs are sequential without concurrent builds/heavy checks. Calls exclude
HTTP/VPN/browser rendering and measure isolated source-current Engine reads.

The required fixture has 100 projects, 10,000 cards and 50,000 reports. Each card
has two literal labels. The concentrated fixture has one project/1,000 cards
and no reports. Complete counts and every expected tag are asserted per call.

| Catalog | Samples / warmup | Control p50 / p95 / p99 | Ordered stream p50 / p95 / p99 |
| --- | ---: | ---: | ---: |
| Required global, 10k cards | 20 / 2 | 867.2 / 914.2 / 914.2 ms | 423.1 / 448.3 / 448.3 ms |
| Required project, 100 cards | 200 / 20 | 10.27 / 10.57 / 10.81 ms | 4.58 / 4.67 / 4.95 ms |
| Concentrated project, 1k cards | 200 / 20 | 75.46 / 77.80 / 81.74 ms | 33.81 / 34.24 / 47.10 ms |
| Concentrated global, 1k cards | 20 / 2 | 74.70 / 82.55 / 82.55 ms | 33.56 / 35.47 / 35.47 ms |

Project maxima are 10.89 to 5.07 ms at 100 cards and 84.03 to 51.24 ms at 1,000.
The concentrated maximum remains above 50 ms. An initial stream before filtering
invalid identifiers on the caller measures required global 423.5 ms median and
concentrated project 33.7 ms; its complete samples are retained separately.
Global tail estimates have only 20 samples. There is no universal latency claim
under concurrent source operations, when capacity contention stays sequential.

The required benchmark process peaks at 38.1/38.2 MiB control/final RSS, including
fixture creation and indexing. This is not warmed daemon RSS acceptance or a
general memory comparison. Bounded retained observation counts have a separate
unit check. Extra scheduling/parallel CPU work trades resources for latency;
the process-wide capacity and CPU cap remain explicit.

## Verification and publication

Six source tests pass serially, including ordered values/current bytes, bounded
in-flight observations, early failure cleanup, worker panic and shared-capacity
fallback. Sixteen focused tag tests pass. New real-source regressions cover 320
cards, fresh external titles/labels/versions, archived cards, invalid/symlink
neighbors and invalid names before/between/after valid files. Another creates
the actual 50,000-file boundary, verifies invalid names consume it, keeps detailed
issues at 500 plus the correct omitted count and excludes a valid later file.

The full gate passes 265 Rust, 139 JavaScript and 12 Python tests, contracts,
formatting, Svelte, clippy, bundle bounds and release builds. Tags and editor
pass in real release Chromium 153.0.8010.12 and WebKit 26.6. The new browser
case adds 80 external source cards, refreshes usage from 80 to 79 after an edit
and checks the exact current version/title in a rename preview. Project isolation,
archived merges, stale-plan rejection, retained drafts and narrow editor controls
remain covered. The final Chromium preview is visually inspected; WebKit keeps
behavioral results without injecting screenshot styles. Manual publication is
pending at this implementation checkpoint.

Ignored evidence: `test-results/tag-parallel-2026-09-30/` contains control/initial/
final JSON sample arrays, process timing, focused/full checks, browser results,
screenshots and temporary benchmark sources. The example is removed before the
full gate and is not shipped. No acceptance status or requirement is changed.

Dense Calendar, further history distributions, source-size/concurrency profiles
and durable-write pauses remain candidates. Physical devices and end-to-end
release acceptance remain open; this is one measured iteration of the full goal.
