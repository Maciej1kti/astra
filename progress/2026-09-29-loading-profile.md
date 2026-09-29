# Loading profile — 2026-09-29

Owner request: assess further improvements to loading and perceived speed before
the proposed legacy-code cleanup. Application baseline: `817ab73`.
Scope: release measurements and ranked optimization candidates.

## Measured behavior

Ordinary HTTPS pairing against an isolated release daemon, three synthetic
projects, 37 cards, four reports and two milestones. Five cold/warm/open samples
per profile; five navigation samples per destination, with 15 returns to List.
Readiness is the relevant rendered content followed by two animation frames,
observed through DOM mutation rather than automation polling intervals.

| Median, milliseconds | Local | Constrained network/CPU |
| --- | ---: | ---: |
| First List load, fresh browser cache | 72.2 | 878.8 |
| List reload, warm browser cache | 38.5 | 514.5 |
| Switch to List | 242.4 | 350.4 |
| Switch to Projects | 235.0 | 355.4 |
| Switch to Updates | 241.7 | 337.0 |
| Switch to Focus | 242.6 | 438.2 |
| Open a card from List | 28.7 | 178.8 |

The first API request after navigation starts about 203–207 ms after the click.
`App.svelte` applies the same 200 ms debounce to every changed view query. Local
API durations in this small fixture are typically single-digit milliseconds.
This makes the intentional delay the clearest low-risk loading target.

Startup currently reads bootstrap, then preferences, then the visible view's
data. List's projects/cards requests are already parallel. Focus needs additional
bounded reads; the earlier pin-index optimization should be retained.

The built initial JS/CSS total is 142,354 bytes (139.0 KiB) using the bundle gate's
gzip calculation. Initial JavaScript includes the editor, Markdown parser,
settings and registration UI. Module analysis identifies Markdown and the editor
as substantial contributors; rendered module sizes precede final minification
and must not be presented as additive final bundle bytes.

Static assets already have build-time gzip and immutable caching. Board, Calendar
and Gantt already use separate chunks. Brotli would reduce the current main JS
from 132,753 to 112,868 bytes in the local compression comparison (about 15%);
this is a byte-size result, not a demonstrated end-to-end speedup.

## Recommended order

1. Start view/project/discrete-filter reads immediately; retain debounce only for
   typing into server-backed search. Keep cancellation, latest-query ownership,
   pagination reset and guarded draft navigation. Verify both instant navigation
   and coalesced typing with controlled timers, then repeat this profile.
2. Split nonessential startup code, especially editor/Markdown and settings.
   Load editor code alongside its resource read or after the first view is ready,
   so a smaller startup does not merely move the delay onto the first card click.
   Preserve pending-command lifetimes and add an explicit failed-chunk retry.
3. Overlap planning chunk loads: `App` currently imports `DateViews`, which then
   imports Calendar or Gantt. Inspect this extra serial stage before changing the
   widgets themselves. This is a code-level candidate, not a measured result here.
4. If startup latency is still material, reduce the bootstrap/preferences/data
   round trips. A changed bootstrap contract needs schemas, examples, an ADR and
   recovery/session tests together; do not guess preferences or display stale data
   as current. Static Brotli is another smaller, separately measurable candidate.

These candidates are not implemented or accepted performance results. Large-list
virtualization, broad response caches and storage rewrites are not supported by
this small-fixture measurement. Earlier durable-write limits remain recorded in
the three-pass remediation; write confirmation and filesystem guards still apply.

## Environment and evidence

macOS 27 ARM64, Apple M4, 16 GiB; Node 24.11.0, Rust 1.92.0 release daemon,
Chromium 153.0.8010.12, viewport 390 × 844. The constrained profile uses Chromium
emulation: 100 ms request latency, 6 Mbps download, 1 Mbps upload and 4× CPU
slowdown. It does not reproduce a physical iPhone, a measured Tailscale route,
packet loss or a large project. The daemon/index is warm; a missing-index restart
is outside this profile. Medians from small samples do not establish p95 targets.

Raw data and scripts are ignored under `test-results/loading-2026-09-29/`:
`loading-baseline.json`, `loading-summary.json`, `profile-loading.mjs`,
`bundle-modules.json` and `bundle-compression.jsonl`. Earlier `polling-*` outputs
include automation polling overhead and are excluded from the table above.
No application code, dependencies or runtime settings changed during profiling.
