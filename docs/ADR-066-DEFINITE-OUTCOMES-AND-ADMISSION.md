# ADR-066 — Definite outcomes before a target changes, and session-gated admission

Status: accepted for the owner-authorized repository review fixes, 2026-10-05.

The review reproduced four behaviors in which the server reported less than it
knew, or let an unauthenticated caller hold shared capacity:

- any failure after `PREPARED` left the command pending and refused every later
  write to that project until the daemon restarted, including failures that
  happened before the rename or unlink was attempted;
- interrupted intents were completed only by startup recovery;
- a transient read failure, and a delete refused during recovery, were journaled
  as terminal rejections and replayed for the same request ID after the condition
  cleared;
- a malformed resource ID returned `503 SERVICE_UNAVAILABLE`, which a command
  client must treat as an uncertain write;
- all listeners shared one eight-permit admission pool that was taken before
  authentication and held for the whole body timeout.

## Outcome of a write that never reached its target

The [write contract](04-WRITES-AND-RECOVERY.md) makes an outcome uncertain once
the rename may have happened. Before that point the target still holds exactly
the bytes observed when the intent was journaled, so the outcome is known.

A source write or delete that fails before its rename or unlink is attempted
withdraws its intent in one journal transaction:

- a changed target (`StoreError::Conflict`, or a delete guard's rejection) becomes
  the command's recorded rejection: `412 VERSION_CONFLICT`, or the guard's reply;
- any other storage failure forgets the command and returns the failure. The
  response remains retryable and the unchanged request ID is admitted again.

The intent stays `prepared`, exactly as before, when a commit point reports the
interruption, when the rename or unlink has happened, when the failure is an
`EIO` (POSIX does not specify the target after a failed rename), when the error
is not a storage error, or when the withdrawal itself cannot be journaled.
Recovery rules for a pending intent are unchanged.

## Recovery at the next write

A writer that finds unresolved intents for its project first runs the startup
recovery rules for that journal's intents, under the project lock it already
holds, and proceeds only when none remain. A matching `after` is completed, a
matching `before` is resumed when references still match, and anything else
becomes `needs_review` without touching source bytes. `needs_review`, intents
owned by another profile's journal, workflows and project deletion still refuse
the write with `PROJECT_RECOVERY_REQUIRED`. That refusal is transient and is no
longer journaled for deletes, matching ordinary writes.

A source that cannot be read at admission is rejected as `DOCUMENT_INVALID` only
when it exists in an unacceptable form. Other read failures are returned without
a recorded result.

## Malformed resource IDs

Collection sources are named by canonical UUIDv4. A request under
`/api/v1/projects/{project}/{cards|milestones|updates}/{id}` whose ID has any
other form receives `404 RESOURCE_NOT_FOUND` before admission. No command row is
created; the response is definite. Store-level `INVALID_ID` for a stray file
inside a collection keeps its existing handling.

## Admission

The local socket and the network listener have separate eight-permit pools, so
network callers cannot refuse the peer-verified CLI. On the network listener a
request body is collected only when:

- the caller holds a valid session, checked passively before the body is read
  (dispatch still performs the full authentication, CSRF and activity update); or
- the request is `POST /api/v1/auth/pairings` or `.../claim`, bounded by two
  additional collector permits.

Static assets, `/healthz` and `GET /api/v1/auth/pairings/current` never read a
request body. An unauthenticated request for any other route receives its
existing `401`. Host, Origin, cross-site and content-type checks still run
first; limits, timeouts and error codes are unchanged.

A refused request releases its admission first and then has its body read and
dropped, unbuffered, within the ordinary size and time bounds before the reply
is sent. Replying while a proxy is still uploading made the connection close
under it: a probe through the test proxy turned 79% of 64 KiB and 90% of
900 KiB unauthenticated writes into an empty `503` or a reset, and reset
unrelated requests sharing the proxy's connections. After the change all 360
such writes received `401` and no other request was disturbed. The same applies
to `SERVER_BUSY`. An unfinished upload therefore occupies a connection for at
most the body timeout, but never an admission permit.

## Not changed

A measured probe rejected removing the second flush in `sync_file`: on the
development host `sync_all` already issues `F_FULLFSYNC`, and the following
explicit call costs about 0.1–0.3 ms because nothing is dirty. The durable
sequence is unchanged. `needs_review` still has no operator resolution; that
requires a separate decision. Schemas, OpenAPI operations and source formats are
unchanged, so no contract regeneration is required.
