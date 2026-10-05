# ADR-067 — Operator resolution of a reviewed source intent

Status: accepted on the owner's 2026-10-05 direction to complete the review fixes.

An interrupted source write whose target then holds neither its observed `before`
bytes nor its intended `after` bytes becomes `needs_review`. The
[write contract](04-WRITES-AND-RECOVERY.md) forbids overwriting or restoring the
source automatically, and until now nothing could settle the state: every later
write to the project was refused and maintenance refused to plan, so the only
exit was editing the operational database by hand.

## Decision

Add one host-local resolution: keep the current source and reject the command.

- `GET /local/v1/recovery/intents[?project_id=UUID]` lists the selected
  profile's unresolved source intents. Each item carries the request ID and
  epoch, state, project and target, the operation (`create`, `replace` or
  `delete`), and the `before`, `after` and current source versions. An absent or
  unreadable source reports a `null` current version.
- `POST /local/v1/recovery/intents/{request_id}/abandon` with exactly
  `{"project_id": UUID, "current_version": Version | null}` settles one intent.
  The supplied version must equal the source's version at that moment; `null`
  states that the source is absent. The intent must be in `needs_review`.

Abandoning discards the saved `before`/`after` bytes, removes the intent and
records the original command as rejected with `409 RECOVERY_ABANDONED` in one
journal transaction. No source file is opened for writing. The original client's
status lookup and an unchanged retry then receive that rejection; a deliberate new
edit needs a new command and the current version.

`projectctl recovery list` and `projectctl --project DIR recovery abandon
REQUEST_ID (--if-version VERSION | --if-absent)` expose the two operations. The
reviewed version is always stated; omission is an argument error.

## Boundaries

- Local socket only. The network listener returns `404` for `/local/`, and the
  browser has no control for this decision.
- Only `needs_review` can be abandoned. `prepared` and `blocked` intents are still
  completed by recovery at startup, at the next write or by the host's periodic
  pass; refusing them here returns `409 RECOVERY_NOT_IN_REVIEW`.
- Only single-source intents are listed. Project deletion, workspace intents and
  workflows keep their own recovery and are not offered.
- Each profile settles its own journal; `--user` selects it.
- There is no "apply the saved intent" resolution. Re-applying would overwrite a
  source another tool changed. The operator who wants the intended content edits
  the card again with the current version.
- Settling a review is not a durable command with its own request identity. A
  repeated call finds no intent and returns `404 RECOVERY_INTENT_NOT_FOUND`.

The projection is not refreshed by the resolution: the source did not change, and
the watcher already reported the external edit that caused the review.

## Verification

Application regressions build the reviewed state through the real writer and an
external edit, then cover listing, the kept source bytes, the recorded rejection
and its replay, the unblocked project, a stale or missing observed version, an
absent source, and refusal for prepared or unknown intents. A daemon test covers
route strictness and the absence of the route on the network listener; CLI tests
cover both subcommands and argument errors that never contact the daemon.
