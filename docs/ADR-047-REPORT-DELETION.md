# ADR-047: Explicit conditional report deletion

Date: 2026-09-26. Status: accepted by owner direction.

Reports retain immutable contents and correction/resolution semantics. The owner
also requires explicit permanent deletion through the API, replacing the need
for stopped-daemon cleanup. `DELETE /api/v1/projects/{project_id}/updates/{update_id}`
requires an empty JSON object, the observed strong If-Match version, request ID
and command epoch. Browser pairing, CSRF and Origin requirements are unchanged.
`projectctl --project <folder> report delete <id> --if-version <version>` shares
this endpoint and supports explicit original identity flags for retries.

Reports referenced by another report's `supersedes` or `resolves` cannot be
removed: `409 REPORT_REFERENCED` identifies the referencing report. Delete
referring reports first. Archived projects reject deletion. Missing targets,
missing preconditions, stale versions and nonempty inputs retain ordinary
404/428/412/422 semantics. No cascade or force bypass is provided.

Cards and reports share source-deletion orchestration and the existing durable
writer. The workspace gate serializes membership changes with normal writes.
Report guards inspect validated source documents, including collection membership,
before preparation and again before unlink. Startup recovery repeats the guard,
including when the target is already absent, so an external new reference puts
the intent into review. Invalid dependent source data prevents deletion.
Project versions remain journal references; source version checks and directory
synchronization precede a committed response. Index failure cannot undo a durable
source deletion and retains the existing projection repair path.

Command admission precedes source lookup. Identical retries replay the original
result after deletion/restart; a changed payload or version with the same identity
is rejected. Operational history/read receipts are retained for normal retention.
Deletion has no Undo. Deleting a resolution can make its original decision active
again; projections are computed from the remaining reports.
