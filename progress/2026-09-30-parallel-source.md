# Bounded source read performance, 2026-09-30

The owner's performance objective remains open. Following the verified
[lease path change](2026-09-30-source-paths.md), the application collection helper
reads independent source files in bounded sorted batches. See
[ADR-055](../docs/ADR-055-BOUNDED-SOURCE-READS.md) for lifetime, capacity and error
ordering. No validation, freshness, observed-version or durability check is
removed.

## Release comparison

macOS 27, Apple M4/16 GiB, Rust 1.92.0, local SSD, release Engine benchmark.
Each condition starts with one disposable project, 1,000 cards and no reports;
20 warmup iterations precede 200 measured mixed mutations (40 creates/160
conditional title patches), interleaved with reads. Transport/browser/device
costs are excluded. External process memory includes synthetic fixture creation.

The first four-worker probe, before the process-wide capacity guard, measured
create p50/p95/p99 115.1/148.1/366.2 ms. Final capacity-guarded code is measured
separately below. Runs B/C alternate control and final optimized release binaries;
all observed tails are retained rather than selecting the fastest run.

| Run | Control create p50 / p95 / p99 | Bounded reads create p50 / p95 / p99 |
| --- | ---: | ---: |
| A | 162.7 / 168.4 / 169.7 ms | 141.0 / 178.6 / 1265.6 ms |
| B | 162.9 / 175.0 / 176.9 ms | 117.4 / 134.5 / 138.5 ms |
| C | 162.9 / 170.1 / 170.9 ms | 116.0 / 119.5 / 128.0 ms |

Repeated runs B/C improve create median by about 28–29%. Mixed mutation p95
changes from 165.3/165.9 to 118.9/118.0 ms. Run A's optimized mixed p95 is
155.7 ms; its long create pause remains unexplained and prevents an unconditional
150 ms target claim. With only 40 creates per run, create p99 is the maximum
sample. Quantiles from separate runs are not averaged into a pooled p95.

Conditional title patches, outside this collection path, remain about 27–28 ms
median and 34–35 ms p95 in alternating runs. Run A has higher patch tail latency
as well (68.7 ms p95). Earlier single-run statistics are retained in ignored
evidence. Tag catalog is effectively unchanged at about 175–189 ms median;
it has additional source-read work outside this helper.

The four-worker probe and final runs use about 21.8–22.5 MiB external peak memory
footprint for this small fixture. This is not steady-state daemon RSS acceptance.
## Required dataset profile

A separate release run uses 100 projects, 10,000 cards and 50,000 short reports,
matching the required dataset. It retains 200 measured mixed mutations after
warmup. Cards are distributed at 100 per project, so these creates normally use
the sequential small-collection path; their result is not attributed to the
parallel optimization.

| Operation | Samples | p50 / p95 / p99 |
| --- | ---: | ---: |
| Typical indexed query | 200 | 19.5 / 20.1 / 20.8 ms |
| Mixed durable mutations | 200 | 27.7 / 42.6 / 49.1 ms |
| Create subset | 40 | 41.4 / 49.1 / 54.6 ms |
| Conditional title patch subset | 160 | 27.6 / 32.6 / 36.4 ms |
| Attention query | 200 | 83.6 / 85.9 / 90.1 ms |
| Legacy global tag catalog | 10 | 1811.4 / 1861.0 / 1861.0 ms |

Engine service reopen with an existing index is 59.2 ms; its first retained query
is 8.3 ms. Background reconciliation is 4.6 s; empty-index rebuild is 8.0 s;
fully eager initial startup is 11.0 s. These initialization modes have one sample
and exclude listener/browser readiness. External process peak RSS is 44.2 MiB,
with a macOS peak memory footprint of 32.5 MiB; neither is a warmed daemon RSS
measurement. Transport, interaction, physical-device and general acceptance
remain open. Attention and global catalog cost remain candidates for separate
measurement and improvement.

## Verification and limits

Three focused source tests pass with a single test thread, exercising ordered
current values/versions, an earlier invalid document before a later symlink and
the occupied-capacity sequential path. Their first fixture used the reserved
zero position and was rejected; it is corrected to valid positions without
changing product validation. Existing filesystem guards remain in place.

The full gate passes 255 Rust, 137 JavaScript and 12 Python tests, including
durability subprocesses, contracts, source guards, Svelte, clippy, bundle bounds
and release builds. The full gate passes again on the combined calendar
presentation. All 24 Chromium suites, five WebKit suites (session, planning,
calendar layout, events and protocol), broad HTTPS and planning checks pass.
The existing WebKit deletion fixture's unsupported clipboard permission remains
the coverage limit recorded in the prior source-path iteration; Chromium covers
deletion. The manual restart is pending. No requirement, scope or acceptance
status changes. The earlier report's separate 200-create requirement wording is
corrected: `docs/09-PERFORMANCE.md` requires 200 mixed mutations after warmup.
The benchmark meets that sample count for the mixed workload; its create subset
and smaller initial dataset retain their stated limits.

Ignored evidence lives in `test-results/calendar-rendering-2026-09-30/`:
`source-parallel-before.json`, `source-parallel-after.json`,
`source-parallel-verified.json`, `source-parallel-control-2.json`,
`source-parallel-parallel-2.json`, `source-parallel-control-3.json`,
`source-parallel-parallel-3.json`, `source-parallel-target.json`, and the retained
build/test/time logs. Commands use the normal release implementation; no benchmark
bypass is added. The target profile command is
`target/release/examples/benchmark 100 100 500`.
