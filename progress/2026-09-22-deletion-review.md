# Card and project deletion review — 2026-09-22

The owner requested an implementation review and immediate removal of the
synthetic project from the running server. This is a proposal, not an accepted
scope change or an implementation of product deletion controls.

## What exists

- Cards have `archived`; projects have `state: archived`. The editor exposes these
  fields, but there is no dedicated deletion action. Archive preserves sources,
  references and history; it should not be relabeled as deletion.
- [ADR-012](../docs/12-ADRS.md) and [API rules](../docs/05-API-AND-EVENTS.md)
  describe archive and workspace unregistration without source deletion.
- [OpenAPI](../contracts/openapi.yaml) declares both GET and DELETE on
  `/api/v1/registrations/{project_id}`, but
  [HTTP dispatch](../crates/projectd/src/dispatch.rs) implements neither route.
  Adding a browser button alone would fail.
- [Maintenance](../crates/application/src/maintenance.rs) implements local
  unregistration with an observed workspace version, a saved plan, durable job
  execution, removal from workspace/focus and subsequent projection cleanup.
  Existing tests cover retained sources and projection failures/restart.
- [Writer](../crates/application/src/writer.rs),
  [journal intents](../crates/application/src/journal.rs) and
  [workflow steps](../crates/application/src/workflow.rs) require after-bytes.
  There is no normal durable delete operation or recovery state for an expected
  absent result. Removing a file in an HTTP handler would bypass this contract.
- [Resource history](../crates/application/src/history.rs) reads the current
  source first. Deleted-resource history needs explicit support. By contrast,
  [report history](../docs/ADR-029-BOUNDED-REPORT-HISTORY.md) can query a missing
  target's reports; those append-only reports must remain intact.

## Recommended behavior

| Action | Result |
| --- | --- |
| Archive card / project | Existing reversible archive behavior, clearly named. |
| Delete card | Move into a project trash area; hide from normal views; offer restore. |
| Remove project from Astra | Remove registration and focus entries; preserve its folder, `.project` and AGENTS instructions. Show the exact project and explain this in confirmation. |

A trash area is a new source lifecycle proposal, separate from the deferred
backup archive tooling. Its retention and permanent purge policy need an owner
decision before implementation; do not introduce automatic timed deletion.
Deleting an entire repository directory should never be an implicit consequence
of removing its registration. Permanent removal of project metadata, if desired,
needs an explicitly scoped maintenance workflow and a reviewed inventory.

For cards, keep the original UUID, source bytes and deletion metadata durably
inside `.project/`, not only in the disposable index or expiring history. Restore
must require an observed trash version and refuse an occupied source destination.
Before deletion, inspect incoming dependencies from source documents, including
archived cards. Show blockers and require explicit disconnection; do not silently
rewrite other cards. Keep reports and history discoverable for deleted targets.
Define how focus references are presented or removed without weakening the
workspace version contract.

## Implementation order and verification

1. Expose unregistration through the shared application layer, implement the
   advertised registration resource/routes, and add browser confirmation plus a
   named CLI command. Bind the observed workspace version to confirmation.
   Reuse existing durable machinery, but reconcile its job response with the
   public route's currently declared command response. Preserve command identity
   and epoch through uncertainty, and refresh navigation/projections only after
   the confirmed outcome. Handle removal of the currently open or last project.
2. Add dedicated archive/restore actions using existing conditional mutations.
   Preserve unsaved editor/report drafts and pending command identities. Keep
   archive distinct from deletion in labels and filtering.
3. Implement card trash/restore as an explicit recoverable operation. Extend the
   source contract, safe filesystem operations, journal/workflow representation,
   recovery, history and projections together. Moving between directories must
   durably synchronize both parents and handle intermediate states. Recovery must
   stop for external edits or occupied destinations; never restore from the index.
4. Update OpenAPI/schemas, generated types, examples and an ADR in the same
   protocol change. Start deletion/recovery work with failing regressions. Cover
   stale versions, concurrent dependencies, missing sources, retries after lost
   responses, every filesystem/journal crash boundary, source collisions on
   restore, broken references, projection repair and browser navigation/drafts.
   Run the full gate, subprocess durability suite and relevant browser suites.

## Completed cleanup and launcher fix

Identified the sample by its source metadata, registration path and the three
launcher-generated cards. Unregistered it through the running daemon using the
observed workspace version. The job reached `done`; a complete projects page
then contained the two real projects and no sample. Source files were retained
by the supported operation. No daemon restart or service deployment was needed.
Operational identifiers and paths are recorded only in the ignored project
report, not in this repository evidence.

The launcher previously interpreted an unregistered sample as a request to
register it again. [Sample seeding](../scripts/try-seed.mjs) now runs only when
the sample's `.project` entry is absent. An existing entry, including a symlink,
is left alone; errors other than absence abort seeding. Registration and card
creation still use the normal CLI. An intentionally retained sample can be
registered again explicitly.

The unregistered-sample regression failed with the previous seeding behavior and
passes after the fix. A second behavioral test covers initial creation of three
cards and preserving existing data on subsequent launches. Calling the same
helper against the retained live sample also made no CLI calls.

Full `scripts/check.py` passed on Linux x86_64 with Node 24.11.0, Python 3.14.7
and the installed Rust 1.98.1 toolchain (not the documented Rust 1.92.0 pin):
175 Rust tests, 84 JavaScript tests, 12 Python tests, schema/example/link checks,
frontend typing, import boundaries, formatters, Clippy and release builds. The
interactive desktop portal test remains ignored by the ordinary gate. Package
validation also passed after adding this review. Logs are in ignored
`test-results/deletion-review-2026-09-22/`. Browser suites and a full restart of
the live manual host were not run; no browser/device acceptance is claimed.
