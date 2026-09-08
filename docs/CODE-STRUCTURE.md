# Code structure and ownership

This describes the maintained implementation. Source formats and HTTP behavior
remain governed by [the contracts](../contracts/openapi.yaml) and
[write/recovery rules](04-WRITES-AND-RECOVERY.md).

## Browser application

[App.svelte](../apps/web/src/App.svelte) composes features, chooses visible views
and connects their callbacks. Long-lived state has three owners:

- [session](../apps/web/src/features/session/session.svelte.ts) owns pairing,
  bootstrap and the event-stream lifetime;
- [navigation](../apps/web/src/features/workspace/navigation-state.svelte.ts)
  owns the route, browser history and guarded navigation;
- [view data](../apps/web/src/features/workspace/view-data.ts) owns loaded rows,
  cursors, request cancellation, generations and queued invalidations.

Features live under `apps/web/src/features/`: workspace, editor, cards, board,
planning, tags, session, settings, registration and host diagnostics. Import the
specific module needed; there are no catch-all feature barrels. Cross-feature
UI actions use explicit props/callbacks.

Workspace [screens](../apps/web/src/features/workspace/screens) own focus,
project overview, resource lists, updates and the workspace board overview.
Navigation exposes a read-only route and explicit actions; only navigation owns
the generation that cancels obsolete resource reads and history restoration.

`lib/api` owns transport, bounded reads, invalidation batching, typed resource/
planning/tag endpoints and command execution. Feature code should use a named
endpoint when one exists; response types are asserted only at transport boundaries. `lib/contracts` contains generated types; `lib/resources` contains
shared resource presentation; `lib/ui` contains shared rendering and dialog
behavior. Global theme tokens and dialog defaults live in `styles/`. Workspace
and editor styles belong to their own presentation surfaces.

### Commands and editor drafts

Every command consumer uses the same
[controller](../apps/web/src/lib/api/command-controller.ts), with a small Svelte
adapter. A controller owns one command from preparation to a definitive result.
It retains the original payload, request ID, epoch and expected version during
uncertainty. A failed status lookup does not prove that the write failed.
Registration features additionally own their accepted job's polling lifecycle.

[Editor targets](../apps/web/src/features/editor/editor-target.ts) bind the
resource kind to its source shape. Each kind has its own fields and initial
values in [editor drafts](../apps/web/src/features/editor/editor-draft.ts).
Dirty checks and draft export use that single state. Focus/read actions retain
an explicit UI intent alongside the command; completion does not inspect URLs.
Resource conflicts keep the original draft and require a deliberate new edit.
Submission and status lookup use the same feature outcome handler. Conflict state
is recorded before fetching optional current details, so an unavailable read
cannot make a stale proposal editable again.

All named OpenAPI schemas are exported by contract generation, including inline
unions. New endpoint functions should use these types, as in
[resources](../apps/web/src/lib/api/resources.ts). Extra JSON fields remain an
explicit user input boundary and are always validated by the server.

### Planning and tag ownership

[PlanningRead](../apps/web/src/features/planning/planning-read.ts) owns one view's
request generation, cancellation and deferred publication during gestures. Calendar
and Gantt keep their own pagination policy. Typed widget adapters convert inclusive
domain dates and forecast projections into vendor events/tasks without modifying
source rows. Gantt gesture activity is passed through its instance context.

[Tag review](../apps/web/src/features/tags/tag-review.svelte.ts) owns catalog
commands, preview, individual card retries and completion. `TagManager` owns
rendering, filtering, focus and close/clipboard presentation. A partially completed
batch retains independent command identities and never reports completion merely
because one card saved.

## Rust application

The CLI owns argument translation, bounded input/project resolution, named view
queries, operation-aware transport and optional terminal presentation in separate
modules under `crates/projectctl/src`. `transport/response.rs` checks command
confirmation envelopes and identity; source validation remains server-owned.
See the [CLI guide](../CLI.md) and [ADR-032](ADR-032-EXPLICIT-CLI-OPERATIONS.md).

[Engine](../crates/application/src/engine.rs) owns storage handles and application
services. HTTP and the CLI cannot access its journal, index or operation gate.
The [service facade](../crates/application/src/service.rs) exposes command status,
authentication, job queries, subscriptions and maintenance operations. Journal,
writer, workflow and index implementation modules are private to the crate.

[Source reads](../crates/application/src/source.rs) return validated documents
with their original byte versions. Workspace reads return `Versioned<Workspace>`.
Registration, workspace mutation, source-dependent ordering and dependency checks
operate on these models. Projection rows and patch envelopes still use JSON where
the schema intentionally varies; this does not replace domain validation.

Patch preparation composes creation defaults, patch/undo application, placement
resolution and report reference collection as named steps. It produces a candidate
and observed references. Writer
validates the complete candidate, checks source versions again and preserves the
existing durable prepare/write/commit sequence. Original command JSON stays in
the journal. Source serialization retains canonical key ordering; no-op writes
retain the original bytes. This refactor requires no source or database migration.

The index separates lifecycle/storage, reconciliation, projection updates,
queries and event replay. Board, calendar, attention and timeline projections
have separate modules under `views/`; substantial static queries have adjacent
SQL files. Row mapping and domain decisions remain in Rust.

### Locks and errors

Lock order is the workspace gate, store registry, project store, journal, then
index. The registry lock is released before the project store is locked. Release
journal transactions before publishing index notifications. Code holding the
workspace gate must not enter another method that acquires it again.

Errors distinguish poisoned locks, invalid stored JSON, source validation,
missing operational sources, database/storage failures and broken invariants.
Stored errors retain causes and static operation labels, including non-JSON values.
Transport responses preserve the existing error contract and do not expose
internal failure details. Command states and workflow kinds are enums whose saved
string spellings remain unchanged. Journal target lookup and committed-result
warning updates are owned by Journal, not mutation SQL.

[Journal records](../crates/application/src/journal/records.rs) owns command-row
insertion, transitions and status reply selection, using the caller's transaction.
Rejected status results come from the stored error slot. Typed
[workflow inputs](../crates/application/src/workflow/model.rs) separate execution
paths from preview fields while retaining the saved JSON format and digest.

Timeline analysis takes typed schedule, dependency and reliability inputs from
the Gantt projection adapter. Invalid indexed shapes produce a stored-data error
instead of silently dropping dependencies.

[Operational failure records](../crates/application/src/diagnostics/failure.rs)
retain the stage, error category, safe identifiers and available IO/SQLite code
on stderr. Error messages, paths, source documents and credentials are excluded.
Reporting is best effort and cannot alter an acknowledged result. Blocking-worker
failures are distinguished from errors returned by the application.

After durable maintenance, store cleanup and projection repair do not replace the
recorded result. [Projection repair](../crates/application/src/engine/projection_repairs.rs)
retries at most 16 due projects per batch, with 30 seconds between failed attempts.
It derives the target from the current workspace; startup reconciliation handles
restart. IndexRebuild still requires its refresh before durable job completion.
See [ADR-033](ADR-033-AUDIT-OWNERSHIP-AND-RECOVERY.md) for these boundaries.

## Checks and fixtures

Run `.venv-check/bin/python scripts/check.py`, then
`ASTRA_TEST_PROFILE=release npm run test:browser`. TypeScript rejects unused locals
and parameters. Prettier covers the frontend and all maintained JavaScript
scripts/tests; Rust uses rustfmt and Clippy with warnings rejected. `scripts/check-boundaries.mjs`
rejects shared frontend imports of feature implementations. Compile-time endpoint
examples live in `apps/web/src/type-tests`; behavioral unit tests run with
`npm run test:unit`.

White-box application tests compile inside the crate, so production APIs do not
need fixture accessors. Engine scenarios are grouped under `tests/engine/` and
share the parent fixture. Subprocess durability tests still terminate at every
write boundary and verify recovery using the original command identity.

Browser regressions share [host](../scripts/browser/host.mjs) and
[runtime](../scripts/browser/runtime.mjs) helpers for explicit fixture selection,
CLI outcomes, real pairing and cleanup. Each selected suite receives a fresh
synthetic host; suites own scenario assertions and artifacts. Maintained test
entry points and selection commands are in the
[browser guide](../scripts/browser/README.md).

See [current evidence](../progress/STATE.md) and the
[contribution guide](../CONTRIBUTING.md) for verification and change conventions.
