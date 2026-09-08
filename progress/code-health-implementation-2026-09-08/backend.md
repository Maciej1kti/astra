# Backend implementation and measurements

Projection issues use collection-relative paths and publish health changes even
when an invalid resource has no indexed row. Targeted publication seeks the full
composite key, retains unrelated rows/issues and deduplicates target inputs.
Regression tests cover malformed filenames in multiple collections, invalid
contents, deletion/recreation and the bundled SQLite query plan.

Report queries accept a validated target type/ID pair only for updates. Filtering
occurs before pagination, uses a target index, participates in cursor identity and
is covered with more than 20,000 unrelated reports. OpenAPI, its generated schema,
an example and ADR-029 were updated together.

Gantt copies its bounded data/revision snapshot under the index lock, then parses
and analyzes the graph outside it. A bulk predecessor lookup preserves warnings
for archived, cancelled, missing and invalid predecessors. The forecast still
uses the full bounded project snapshot, independently of the visible page.

Card preparation reuses its collection scan. Writer references deduplicate matching
keys/versions and reject differing observations rather than choosing one. Final
source checks, ordering/dependency constraints, fsync and recovery remain in place.
Reference and diagnostic regressions were run before their fixes.

Service initialization completes recovery before admitting requests, then the
watcher verifies project sources sequentially. The disposable pending table marks
retained and empty projections incomplete. Responses expose stale freshness and
warnings; unchanged sources do not rewrite documents/FTS during startup or full
reconciliation. A trigger-count regression verifies zero such rewrites. Successful
prepared writes recover before readiness, while conflicting external edits remain
blocked. ADR-030 documents this lifecycle.

## Release observations

The final standard workload uses 100 projects, 10,000 cards and 50,000 reports,
20 warmups and 200 measured operations. See [final measurements](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-implementation-2026-09-08/checks/backend-final.json)
and the [audit baseline](../code-health-2026-09-08/checks/benchmark-standard.json).

| Operation | Baseline p95 | Final p95 |
| --- | ---: | ---: |
| List/search | 20.86 ms | 20.45 ms |
| Attention | 31.39 ms | 29.82 ms |
| Durable mutation mix | 111.11 ms | 71.66 ms |

The write mix improved by about 35.5%; small read differences should be treated
as normal benchmark variation. On the final implementation, a fully indexed eager
reopen took 4,952 ms versus 52 ms for recovery-first service initialization. The
first retained query took 10 ms, and source verification still took 4,994 ms in the
background. Empty-index initialization took 79 ms; rebuilding took 8,532 ms.
These startup modes each have one sample and measure the engine, not process-to-
listener or complete browser readiness. The old audit startup initialized a largely
unpopulated index and is not a comparable fully indexed restart measurement.

A separate [single-project workload](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-implementation-2026-09-08/checks/backend-single-project.json) with
1,000 cards and 500 reports exposes remaining scaling cost: mutation p50 28.58 ms,
p95 478.30 ms. This mixes creation and editing and does not isolate each operation.
Large-collection mutation preparation/source preconditions remain a profiling
target; this work does not claim all project sizes meet the standard workload's
150 ms write budget. No checks were weakened to improve the number.

An initial large measurement failed while the system disk was nearly full and is
excluded. Only this repository's disposable incremental build cache was cleared
with approval. The preliminary successful run also overlapped verification work;
the separately repeated final measurements above are the reported comparison.
All data was synthetic and temporary. Timings exclude VPN, rendering, measured
steady-state RSS and dense concurrent graph contention; those remain separate
performance measurements, not implied by the functional regressions.
