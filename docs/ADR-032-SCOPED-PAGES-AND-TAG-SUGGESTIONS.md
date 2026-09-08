# ADR-032 — Scoped page identity and indexed tag suggestions

Status: accepted for the owner-authorized code health fixes, 2026-09-08.

Public `snapshot_cursor` values and SSE cursors retain their global ordering and
stream epoch. Opaque page cursors for a selected project additionally use its
local projection sequence and the workspace invalidation sequence. A write in
another project therefore does not invalidate the selected project's page. Local
source/health changes and workspace invalidations still do. Global queries retain
global page identity. Restart/rebuild changes the stream epoch and invalidates old
cursors. Local sequence changes commit in the same index transaction as source
projection changes; the index remains disposable.

`GET /api/v1/workspace/tag-suggestions` returns up to 10,000 exact names from indexed
cards (including archived cards/projects) and managed vocabulary. It includes
`complete`, `freshness`, a global `snapshot_cursor` and warnings. Completeness is
relative to the bounded projection, not proof of fresh coverage of source files.
Unindexed external changes can appear only after reconciliation. Invalid, pending
or unavailable projections and the name limit produce explicit incomplete/stale
results. This endpoint provides no usage counts or rename authority.

The source-based catalog and rename preview in ADR-028 remain unchanged. They
continue discovering external edits and validating source versions before reviewed
card mutations. TagManager can populate the suggestion cache from its fresh
catalog without exposing its counts as a source snapshot.

Card `changed` events may carry `tags_changed`. False means the old and new
indexed label arrays agree; true means they differ. An omitted value (including
removals or older servers) is conservatively invalidating. Health/workspace events
also invalidate suggestions. No card contents or labels are added to events.

Source preparation and final reference checks continue reading current bytes through
safe descriptors. Each lookup verifies the lease and current directory identity;
collection lookups rely on the existing child-open verification instead of
checking the same parent twice. Dependency validation, fsync and recovery remain
unchanged. No persistent source cache is authoritative for writes.
