# Exact context byte accounting — 2026-10-01

The retained assembler serializes each candidate entry for its exact JSON size
instead of repeatedly serializing the growing response. Array commas and
included/omitted decimal digit changes keep a request-local total exact. Rejected
appends and array caps leave output unchanged. The initial envelope and final
complete serialization remain; source reads, versions, full structured metadata,
UTF-8 excerpts, warnings, next-read hints, the reserve and budget errors remain.
No source authority, cache, write exception or protocol change is introduced.
The verified application is `bfbb58dbf2a7671041451f6b4e9431fba5a42a8a`.

M4/macOS 27 arm64, Rust 1.92, ten available logical CPUs. Saved release binaries
exercise ordinary `Engine::context` after registration/startup on synthetic
projects. Sources use deterministic card IDs, metadata and 512-byte bodies; the
rich profile adds 16 valid acceptance items and eight comments with Unicode,
quotes and backslashes. Each binary/profile has two warmups and 40 selected
reads. A quiet second series reverses binary/profile order. No build, tests or
browser work runs alongside these comparisons.

| Profile | First control → retained median | Reverse-order repeat |
| --- | --- | --- |
| 37 cards, default 24-KiB budget | 10.108 → 9.858 ms | 10.279 → 9.992 ms |
| 1,000 cards, minimum 4-KiB budget | 70.427 → 70.101 ms | 71.102 → 70.870 ms |
| 1,000 cards, default 24-KiB budget | 72.253 → 70.744 ms | 72.679 → 71.047 ms |
| 1,000 cards, maximum 128-KiB budget | 76.698 → 70.492 ms | 76.882 → 71.334 ms |
| 1,000 rich cards, maximum budget | 129.322 → 104.019 ms | 128.626 → 103.433 ms |

The rich profile repeats approximately 25.2–25.3 ms (20%) median savings, and
the ordinary maximum-budget profile saves 5.5–6.2 ms. Small/minimum profiles save
only about 0.23–0.33 ms; broader perceived/UI speed is not established. Tail
variability and one-host coverage do not support a universal p95 claim.

All 800 selected observations verify the explicit project, exact pin order,
included source byte versions/excerpts, serialized maximum and stable output.
Full normalized outputs match the control for all ten profile/series pairs.
Only generated time and the independently generated registration's project
ID/version are normalized; actual project/source versions are checked against
their current resources before normalization. Checklist/comment metadata,
counts, warnings, omissions, hints and truncation remain in the comparison.

The initial rich fixture exceeded the existing 500-character acceptance limit
and was rejected; correcting the fixture retains normal validation. An initial
test compile needed an explicit unsigned integer type, and a mixed-source test
used an unsupported card report target; both fixture issues are corrected without
changing application rules. Failed attempts and complete raw measurements remain
in ignored `test-results/context-budget-2026-10-01/`.

Five focused context tests pass, including complete serialization at adjacent byte
limits, escaped/nested data, counter digit transitions/saturation, every array cap
and rejected state. Ordinary engine writes and external-source fixtures verify
cards, milestones and reports, current byte versions, complete comments/counters,
unavailable-source warnings/hints and 4/24/128-KiB bounds. The full gate passes
465 tests (287 Rust, 171 JavaScript, seven Python). Its initial parallel run
exhausts local disk space during the real source-boundary fixture. Discarding
only the worktree's rebuildable incremental cache and running independent Rust
tests serially permits the complete rerun; limits and explicitly concurrent
scenarios remain unchanged.

Normally paired Chromium/WebKit protocol suites pass, including stale-page
recovery in five views, complete HTTP/CLI context equality at all three budgets,
actual UTF-8 response bounds and out-of-range rejection. The original frontend
and release workspace are rebuilt; manual launcher 41022 is replaced by 64793
with the existing data and connection. Trusted `https://100.122.250.14:47832`
verification preserves 72 prior resource versions, two pins, preferences,
certificate, epoch/instance and the complete normalized ordinary CLI context.
All 32 served assets match the rebuilt frontend, with all 33 dist files matching
the verified worktree. The ordinary CLI report
`618e9be2-fe59-4539-9c62-c7a33e94f630` is committed/read back exactly, preserving
the unrelated owner card. Broader perceived performance,
Linux widget/QML and physical iPhone/release acceptance remain open.

Further context work is supported by current code: `entry` creates a complete
JSON document value, including the body, before selecting metadata and clipping
the excerpt. The cost of that materialization and the remaining guarded candidate
reads still need measurements; no further optimization is accepted here.
