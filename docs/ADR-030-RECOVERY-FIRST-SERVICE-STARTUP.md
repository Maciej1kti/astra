# ADR-030 — Recovery-first service startup (2026-09-08)

Status: accepted for the owner-authorized code health implementation.

The service previously reparsed every source document before binding its listeners,
even when a complete derived index was retained from the previous run. Production
startup now uses `Engine::open_for_service`: state/workspace/workflow recovery and
each registered project's command recovery run before the constructor returns.
Source conflicts retain their unresolved journal state and continue to block normal
project writes. The ordinary eager `Engine::open` remains available to synchronous
tools and measurements through the same recovery implementation.

Before admission, the derived index records registered projects in a disposable
`projection_pending` table. Readers mark retained valid rows stale in their
responses, without rewriting persisted documents or retriggering FTS. This applies even
when the index contains no rows. Lists and planning pages bind their existing
`freshness: stale` value and a `PROJECTION_RECONCILING` warning to the same index
snapshot as their data. Attention pages gain an optional standard `warnings` array.
Diagnostics use the existing `index_state: building` value. Empty pending pages
are explicitly incomplete, not evidence that a project has no resources.

The watcher installs native watches and unions pending project roots into its
first refresh batch. One blocking project worker runs at a time; the fallback also
starts immediately when native watches are unavailable. A successful full refresh
clears that project's pending marker in the projection transaction and publishes
a health invalidation. A failed refresh records unavailable/degraded diagnostics
and clears the initial pending marker, avoiding an indefinite loading state.
Targeted refreshes do not claim that the rest of a project has been reconciled.

Cached projections never replace source verification on mutations or details.
The command epoch, source-file format, leases, preconditions, fsync and journal
protocol are unchanged. Index loss alone neither rotates the command epoch nor
initializes project files. Shutdown may stop between background project scans;
the next start repeats safe recovery and reconciliation.

Tests cover cached and missing-index reopen, all planning-page warnings, completion
events, successful prepared-command recovery, external conflicts that remain
blocked, and source preservation. The release benchmark separates eager indexed
reopen, service indexed reopen, first retained query, empty-index service open,
and the subsequent background work. These engine timings do not establish browser
readiness or eliminate the cost of source reconciliation.
