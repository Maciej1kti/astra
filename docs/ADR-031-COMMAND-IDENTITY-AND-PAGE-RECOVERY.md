# ADR-031 — Original command identity and explicit page recovery

Status: accepted for the owner-authorized code health fixes, 2026-09-08.

Command status belongs to the original `(epoch, request_id)` pair. The existing
required `epoch` query parameter on `GET /api/v1/commands/{request_id}` is now
enforced. Missing epoch returns 400 `MISSING_QUERY_PARAMETER`; a noncanonical
UUIDv4 returns 400 `INVALID_EPOCH`; duplicate/unknown parameters return 400
`INVALID_QUERY`. A valid epoch different from the current operational state
returns 409 `EPOCH_CHANGED` before looking up any command. Only an absent command
in the matching epoch returns 404 `COMMAND_NOT_FOUND`. Neither outcome proves
that an earlier uncertain source write did not commit.

The browser's shared status helper and `projectctl command-status ID --epoch EPOCH`
always carry the original epoch. They must not substitute a newly bootstrapped
epoch. `CommandStatus.error` uses the full documented Error envelope for rejected
commands. Command creation owns a recursively immutable JSON snapshot so later
caller edits cannot change a retry's payload or identity. Domain-specific effects
after completion remain with the caller.

Planning endpoints currently return `PAGE_STALE`; collection endpoints return
`CURSOR_STALE`. Clients recognize both as an explicit request to restart at the
first page, show a notice, and preserve open drafts or gestures. Other failures
do not trigger this fallback. Both names remain supported for existing clients;
this change does not silently alter offsets or remove snapshot validation.

Relation selection uses the already documented typed list endpoint with `q`,
ensuring resource-type filtering precedes the result limit. The general search
endpoint keeps its existing untyped contract.

Tests cover the actual transport's epoch validation and rejected-command schema,
immutable nested retry inputs, both stale-page codes, and a browser relation
search with more than 50 matching reports.
