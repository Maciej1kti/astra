# Code health fixes — 2026-09-08

> Historical evidence. Commands and bare artifact paths describe the original run.
> [Original record and artifacts](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-fixes-2026-09-08/README.md) are preserved in the published checkpoint; see [current status](../STATE.md) for maintained guidance.

The owner authorized implementation after the [follow-up audit](../code-health-follow-up-2026-09-08/README.md).
The baseline is `a71b282c8b95cdb6185943ab9a8edb27f3097128`. This is a verified
maintenance batch, not a claim that all release or performance acceptance is complete.

## Changes

- Collection and planning pages handle both `CURSOR_STALE` and `PAGE_STALE`,
  explicitly show the current first page and then allow normal pagination.
- Selected-project pages have local projection revisions. Other projects' writes
  retain those cursors; relevant source/health/workspace changes still invalidate
  them. Public SSE and snapshot cursors keep their global ordering.
- Command-status reads require the original epoch in UI, CLI and server. Epoch
  changes cannot turn an uncertain command into an apparent missing command in a
  new journal. Rejected status responses now match the documented Error envelope.
- Pending commands own immutable JSON snapshots. Shared status/error helpers keep
  retry classification consistent across editors, settings, tags and dialogs.
  Domain-specific completion effects remain explicit in each owner component.
- Relation discovery uses the typed list search before its 50-result limit and
  cancels obsolete reads. Matching reports cannot crowd cards out of the picker.
- Tag suggestions use a bounded indexed name list, preserving exact historical
  names and showing incomplete/stale results. Fresh source catalogs and rename
  previews keep their authority. Card changes that preserve labels avoid clearing
  the suggestions cache.
- Existing-resource conflicts are rejected before expensive unrelated collection
  parsing. Collection lookups reuse the parent check already performed by the
  safe child-open operation. Lease checks, reference rereads, graph validation,
  fsync and recovery remain in place.
- Registration browsing lives in `RegistrationBrowser.svelte`, kept mounted so
  unresolved registration identity survives closing/reconnecting. Editor patch
  construction lives in `editor-draft.ts`. Core wire types are generated from OpenAPI
  and checked for drift rather than duplicated in `api.ts`.
- Frontend formatting is enforced in the standard gate. A tested bundle check
  traverses static imports/CSS and enforces the 300 KiB initial gzip budget.
  Lazy planning chunks are excluded; the build manifest is not publicly embedded.

The protocol decisions and compatibility details are recorded in
[ADR-031](../../docs/ADR-031-COMMAND-IDENTITY-AND-PAGE-RECOVERY.md) and
[ADR-032](../../docs/ADR-032-SCOPED-PAGES-AND-TAG-SUGGESTIONS.md), with generated
schemas, examples and transport tests in the same batch.

## Verification

The [standard gate](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-fixes-2026-09-08/checks/full-check.txt) passed 119 Rust tests, 54 JavaScript
tests and 12 Python tests, schema/example validation, type checking, formatting,
Clippy and a release build. New tests cover original command identity, immutable
payloads, source conflicts, dependency edits/deletions, scoped pages, exact tag
names and safe filesystem lookups.

The [focused browser run](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-fixes-2026-09-08/checks/browser-protocol.txt) passed all five paged
views against actual server stale-page responses, including successful advancement
after recovery. It also passed relation search with 55 competing reports and
verified lazy, bounded card history and reused tag suggestions.

The [packaged release smoke](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-fixes-2026-09-08/checks/package.txt) passed archive checks, repeated
temporary installation, daemon/CLI operation, restart/copy recovery, index
rebuilding and rejection of an old epoch. This created no persistent service.

The [complete browser run](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-fixes-2026-09-08/checks/browser-all.txt) passed the main HTTPS/CLI smoke,
planning gesture suite and all seven maintained regression suites (card, tags,
editor, dialogs, planning, code health and protocol). This includes registration
after component extraction, lost replies, identical retries, competing edits,
session revocation with preserved drafts, tag renames, keyboard/touch interactions
and mobile viewport checks. The 401/503 console responses in the log belong to
intentional revocation and transport-failure scenarios.

After the final workspace snapshot guard, the [tag and protocol suites](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/code-health-fixes-2026-09-08/checks/browser-final.txt)
and packaged smoke passed again against the rebuilt release daemon.

The bundle gate reports 121,406 gzip bytes (118.56 KiB) against 307,200 bytes
(300 KiB). API type generation adds no browser runtime dependency.

## Release measurements

All profiles ran sequentially on macOS arm64, outside builds/browser tests. Each
mutation profile has 20 warmups and 200 measured operations: 40 creates and 160
existing-card title patches. Source-catalog measurements use one warmup and ten
samples. The tag suggestion read was added to the existing benchmark loop; baseline
source counts and mutation mix are unchanged. These are observations, not a
statistical guarantee or measurements of concurrent writer contention.

| Synthetic profile | Mixed write p95 ms | Create p95 ms | Title patch p95 ms | Suggestions p50 ms | Source catalog p50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| [1 project / 100 cards / 500 reports](checks/benchmark-1-project-100-cards.json) | 86.33 | 92.24 | 32.68 | 0.21 | 26.05 |
| [1 project / 1,000 cards / 500 reports](checks/benchmark-1-project-1000-cards.json) | 406.97 | 410.98 | 29.93 | 0.56 | 193.09 |
| [100 projects / 10,000 cards / 50,000 reports](checks/benchmark-standard.json) | 67.79 | 72.00 | 36.24 | 22.26 | 2019.79 |
| [1 project / 10,000 cards / 500 reports](checks/benchmark-1-project-10000-cards.json) | 3880.42 | 3924.32 | 28.88 | 9.33 | 1963.50 |

The comparable 1,000-card mixed-write p95 moved from 479.39 to 406.97 ms (15.1%
lower). Standard-profile write p95 moved from 71.99 to 67.79 ms. Its list query
p95 moved from 20.92 to 22.31 ms; this batch does not claim faster indexed list
queries. Both baseline files are retained in the linked follow-up audit.

The suggestion column compares the new lightweight operation with the full source
catalog on the same synthetic data. Management still uses the more expensive fresh
catalog when its counts and reviewed changes matter. It is not a claim that fresh
source validation now takes less than one millisecond. The final shared read guard
also prevents workspace mutations during vocabulary/index composition; concurrent
contention is outside these sequential measurements.

Startup timings and OS process-memory observations are in each JSON and its
corresponding `.time.txt`. HTTP/VPN latency and browser rendering are excluded.

## Scope and remaining limits

No runtime dependencies were added. The formatting pass changes line wrapping,
so raw line-count differences are not an accurate measure of removed complexity.
The large components still have further extraction opportunities; this batch
separates concrete responsibilities without replacing the application's architecture.

Historical tracked screenshots remain because existing acceptance records link to
them. New screenshots and traces stay in ignored `test-results/` and CI's 90-day
artifacts. This batch adds concise text/JSON evidence, without rewriting Git
history or deleting still-referenced acceptance evidence.

The source files remain authoritative. A bounded parsed-source cache was measured
and removed because it did not materially improve the large-project write tail;
its memory and invalidation complexity were not justified. Large-project creates
remain above the 150 ms write target: about 407 ms mixed
p95 at 1,000 cards and 3.88 s at 10,000 cards. Meeting that target requires further
work on the source-authoritative ordering/graph path; the index cannot replace
its safety checks.

Browser checks use Chromium and viewport emulation. They do not establish physical
iPhone/Safari, Omarchy desktop, network-latency or physical power-loss acceptance.
