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

`lib/api` owns transport, bounded reads, invalidation batching and command
execution. `lib/contracts` contains generated types; `lib/resources` contains
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

All named OpenAPI schemas are exported by contract generation, including inline
unions. New endpoint functions should use these types, as in
[resources](../apps/web/src/lib/api/resources.ts). Extra JSON fields remain an
explicit user input boundary and are always validated by the server.

## Rust application

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

Patch preparation produces a named candidate and observed references. Writer
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
Transport responses preserve the existing error contract and do not expose
internal failure details.

## Checks and fixtures

Run `.venv-check/bin/python scripts/check.py`, then
`ASTRA_TEST_PROFILE=release npm run test:browser`. TypeScript rejects unused locals
and parameters. Prettier covers the frontend and all maintained JavaScript
scripts/tests; Rust uses rustfmt and Clippy with warnings rejected.

White-box application tests compile inside the crate, so production APIs do not
need fixture accessors. Engine scenarios are grouped under `tests/engine/` and
share the parent fixture. Subprocess durability tests still terminate at every
write boundary and verify recovery using the original command identity.

The [implementation record](../progress/architecture-quality-implementation-2026-09-08/README.md)
tracks the seven review findings and the verification performed for this change.
