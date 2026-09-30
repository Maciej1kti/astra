# Attention query eligibility performance, 2026-09-30

The owner's performance objective remains open. Attention's union branches now
check entity kind and reason eligibility before the shared active/project rules.
The same conjunctions, scopes, receipts, decision resolution, date boundaries,
ordering and pagination remain. This avoids repeated JSON and correlated parent
checks for rows that cannot contribute to that branch. No schema, source format,
API, cursor shape, authorization or write/durability rule changes.

## Release measurement

macOS 27, Apple M4/16 GiB, Rust 1.92.0, local SSD, release Engine benchmark.
The required fixture has 100 projects, 10,000 cards and 50,000 short reports.
Both ordinary runs retain 200 measurements after warmup and interleaved ordinary
reads/creates/conditional patches. The control is the verified `a5f493a` release
implementation. Transport and browser rendering are excluded.

| Ordinary Attention | Control | Eligibility first |
| --- | ---: | ---: |
| p50 | 83.6 ms | 31.9 ms |
| p95 | 85.9 ms | 32.7 ms |
| p99 | 90.1 ms | 34.2 ms |

This is about 62% less time for this profile. Indexed query p95 remains about
20 ms and mixed durable-write p95 about 42 ms. Ordinary Attention is measured
with `focus=false`; this is not a claimed 62% improvement in the full Focus UI.

A separate release fixture changes only the benchmark's Attention call to the
actual Focus variant, `attention_mode(..., 200, ..., true)`. Its 50,000 reports
start unread. With eligibility-first SQL, Focus Attention p50/p95/p99 is
81.8/85.5/108.4 ms (200 samples). That path includes additional unread-report
work and remains a performance candidate.

An archival-membership prototype replaces the per-row correlated check with a
statement-local exclusion set. Its guarded projection and 76 engine tests pass,
including archived/done/cancelled/achieved and retained/missing-parent behavior;
the real projection schema rejects NULL project IDs. It nevertheless regresses
Focus Attention to 116.5/120.2/125.7 ms. The prototype and its extra test fixture
are reverted. No archival-membership change or temporary benchmark example is
shipped. The original correlated archival check remains.

## Verification and remaining limits

The eligibility-first implementation passes all 76 engine tests and the full
gate: 255 Rust, 137 JavaScript and 12 Python tests, contracts, formatting, Svelte,
clippy, bundle bounds and release builds. Returning from the archival prototype
restores that verified source exactly. Focus, planning, event and protocol suites
pass in Chromium and WebKit; broad HTTPS checks pass. The full gate also passes
with the latest empty-counter presentation, followed by passing counters, card
layout and Focus Chromium checks. The manual restart is pending. No requirement,
scope or acceptance status changes.

Ignored evidence lives in `test-results/calendar-rendering-2026-09-30/`:
`source-parallel-target.json`, `attention-filter-target.json`,
`attention-focus-filter-target.json`, `attention-focus-archive-target.json`, and
retained build/test/time logs. Ordinary measurements use
`target/release/examples/benchmark 100 100 500`. The temporary Focus benchmark
source and archival prototype are retained in ignored evidence. Physical-device,
transport and full release acceptance remain open.
