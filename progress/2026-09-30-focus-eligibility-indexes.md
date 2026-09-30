# Focus eligibility and existing partial indexes, 2026-09-30

The owner's performance objective remains open. A large all-read history still
requires examining candidates even when Focus Attention returns no unread items.
Release phase attribution identifies candidate SQL as the dominant cost: median
72.6 ms, versus 5.1 ms for the durable receipt snapshot, 1.3 ms for its hash and
7.2 ms for the event boundary. The full Engine median in that diagnostic is
86.0 ms. These phases use additional read-only connections to a disposable
fixture; their percentiles are not additive or a replacement for full-call timing.

The unread branch now checks the existing statement-local receipt membership
before its remaining eligibility checks. The conjunction, NULL handling,
project/folder scope, archival behavior, sufficient ordered prefix and final
mixed ordering remain unchanged. Review and unresolved-decision branches
explicitly select their existing partial indexes. The bundled optimizer otherwise
chooses broader card/report indexes on this profile and examines unrelated rows.
`Index::open` already installs both indexes before admitting reads, including
older projections. No new index/schema, retained cache, receipt projection,
protocol, lock or durable-write change is introduced.

## Release measurements

macOS 27, Apple M4 / 16 GiB, local SSD, Rust 1.92.0 release Engine and bundled
SQLite 3.53.2. Each implementation uses the same temporary harness and generation
parameters: 100 projects, 10,000 unscheduled planned/active cards and 50,000 note
reports. UUIDs are generated separately in each disposable fixture. Receipt
profiles increase from zero through 1,000 to all 50,000 using ordinary
`Engine::receipts` commands; each profile has 20 warm calls and 200 measurements.
The call is actual `attention_mode(None, None, None, 200, now, true)`, first page.
Control is application code at `ff7fd8c`; optimized code is the change described
here. Runs exclude browser, transport and VPN and are not pooled.

| Read receipts | Implementation | p50 | p95 | p99 |
| ---: | --- | ---: | ---: | ---: |
| 0 | Control | 22.5 ms | 25.6 ms | 31.1 ms |
| 0 | Optimized | 15.2 ms | 17.8 ms | 19.3 ms |
| 1,000 | Control | 22.9 ms | 26.5 ms | 31.6 ms |
| 1,000 | Optimized | 15.8 ms | 17.4 ms | 18.7 ms |
| 50,000, all reports read | Control | 85.5 ms | 91.9 ms | 105.3 ms |
| 50,000, all reports read | Optimized | 52.7 ms | 59.5 ms | 60.2 ms |

The older all-read measurement's 95.2 ms median / 199.1 ms p95 and larger tails
remain recorded in the [previous iteration](2026-09-30-focus-attention-prefix.md).
The fresh matched harness does not erase those outliers or establish a universal
latency guarantee. The all-read case still exceeds the typical-query 50 ms p95
target. Dense decisions/resolutions, concentrated report collections, large
page offsets and other receipt distributions need separate measurement.

An alternating trial in one disposable fixture adds/removes an ordered partial
report index. It removes the unread branch's temporary sort and improves its
receipt-first-only median from 61.2/61.8 to 55.5/55.8 ms, with 200 measurements
per run. Building that trial index costs 53–62 ms for 50,000 reports. It is not
added to production in this iteration; existing partial-index selection is
measured first. The trial does not establish that further gains are exhausted.

## Verification and publication

All 80 engine tests pass. The full gate passes 260 Rust, 139 JavaScript and
12 Python tests, contracts, formatting, Svelte checks, clippy, bundle bounds and
release builds. Focus, events and protocol suites pass in Chromium and WebKit
against fresh real release daemons with ordinary pairing. They retain report
reading, decision resolution, observed-version writes and stale-page recovery
in all five paged views. Rendered desktop Focus and narrow-screen event results
are inspected. Manual publication remains pending.
The new engine regression exercises an older projection without review/decision
indexes, ordinary reopening and index rebuild. It compares mixed Focus results,
read-receipt behavior, exact source bytes and versions. Existing pagination,
archival, target, decision resolution and receipt-identity regressions also apply.

## Reproduction and limits

Ignored evidence is in `test-results/focus-history-2026-09-30/`, including all
sample arrays, diagnostic phases, plans, the ordered-index trial, compiled-run
logs and temporary example sources. Reproduce the three-profile harness with
`focus_profiles 100 100 500 0 200` in release against each implementation. It is
removed from the shipped example tree before the full gate. The preceding
single-profile and diagnostic runs are labeled separately from the comparison.
External peak memory includes fixture creation and normal receipt writes; it is
not warmed daemon RSS. The compared control/optimized processes have maximum
RSS 73,744,384 / 72,728,576 bytes and peak footprint 66,929,144 / 65,929,744 bytes,
including fixture setup. Dense Calendar rendering, source-current tag scans, write
outliers, physical-device and end-to-end performance acceptance remain open.
