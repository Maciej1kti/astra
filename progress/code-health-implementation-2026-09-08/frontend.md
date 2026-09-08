# Frontend implementation

The frontend now loads data for the current view, shares bounded GET requests,
keeps valid pagination across refreshes, and explains when a stale cursor requires
returning to the first page. Source mutations still use their original request ID,
epoch, payload and version, with explicit recovery after uncertain responses.

## Changes

- `view-queries.ts` owns view query keys, required data sections, event scoping,
  cursor handling and focus hydration. Local title filters do not issue new list
  requests. App orchestration coalesces work already running for the same query;
  a new query cancels its obsolete reads. SSE batches have a 150 ms trailing delay
  and a separate 500 ms maximum wait. Unknown/gap events still resynchronize.
- `read-requests.ts` bounds GET concurrency to three and the waiting queue to 32.
  Identical in-flight GETs share transport while each caller keeps independent
  cancellation; transport stops only after the last subscriber leaves. Session
  cleanup aborts old reads. The 15 second deadline includes queue time. Mutations
  bypass the pool and are not automatically retried or cancelled on navigation.
- Board, Calendar and Gantt cancel abandoned requests, coalesce refreshes while
  reading, preserve gesture deferral, and refresh their current page when its
  cursor remains valid. An explicit stale cursor starts again with a visible notice.
- `CardActivity.svelte` reads 50 target-filtered reports per page through the existing
  project updates endpoint. It retains previous/next navigation and reads report
  bodies only on expansion; it no longer enumerates the project's full report archive.
- The editor resolves only its existing dependency and milestone IDs, using at most
  three concurrent reads. New relations still use bounded search. The separate
  active/archive/milestone collection scans have been removed.
- `tag-suggestions.ts` shares source-derived suggestions for 30 seconds and clears
  them on relevant invalidations/session loss. Focus refreshes expired suggestions.
  TagManager independently requests fresh source scans, then supplies that freshly
  observed catalog to suggestions; management preview semantics remain unchanged.
- `gantt-projection.ts` partitions edges in one pass over a task ID set. Forecasts
  use a Map. Hidden/undated predecessors and server ordering remain represented.
- `resource-summary.ts` explicitly projects detail metadata without retaining body
  or extension fields, computes acceptance progress, and uses the contract's
  narrowed availability enum. Focus fallback now retains the same checklist badges.
- Lazy Board/planning loaders display recoverable errors and retry controls. Active
  collection/planning views and card activity surface stale/reconciling projection
  metadata, including the backend's `PROJECTION_RECONCILING` warning.

## Verification and boundaries

Fifteen new targeted tests pass in `scripts/tests/view-projections.test.mjs`,
`read-requests.test.mjs` and `view-queries.test.mjs`. They cover output semantics,
GET sharing/cancellation/queue pressure/session cleanup, query scope and request
count, cursor invalidation, SSE maximum wait, tag TTL/late completions, and mutation
identity after a lost response. The projection regression was introduced before
the summary adapter. [Recorded run](checks/frontend-unit.txt).

The frontend `svelte-check` run completed with zero errors and zero warnings.
Integrated browser verification is recorded in the implementation README; these
unit tests alone do not establish browser or device acceptance. The final planning
regressions also verify stable gesture geometry during held background reads and
safe rendering of metadata-free calendar selection helpers.

Date/Move mutation dialogs retain their explicit completion/conflict behavior.
This change shares and verifies the transport boundary without introducing a
generic UI state machine across dialogs with different draft semantics.

No dependencies were added. No user data or project acceptance state was changed.
