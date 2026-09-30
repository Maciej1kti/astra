# Code structure and ownership

This describes the maintained implementation. Source formats and HTTP behavior
remain governed by [the contracts](../contracts/openapi.yaml) and
[write/recovery rules](04-WRITES-AND-RECOVERY.md).

## Browser application

[App.svelte](../apps/web/src/App.svelte) composes features, chooses visible views
and connects their callbacks. Long-lived state has three owners:

- [session](../apps/web/src/features/session/session.svelte.ts) owns pairing,
  bootstrap, the last authenticated timezone for retained locked drafts and
  the event-stream lifetime;
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

Focus reads its pinned summaries with the ordered membership snapshot. Missing
retained references become unavailable placeholders; older hosts without summaries
use the existing bounded detail-read path. Opening a card still reads its current
source before editing. See [ADR-051](ADR-051-FOCUS-SNAPSHOT-SUMMARIES.md).
`PinnedCard` separates the opening/reordering surface from `FocusCounterChip`.
The cards feature owns the horizontal scrub action and a route-independent
`FocusCounterController`; its confirmed-response overlay prevents old projections
from briefly replacing acknowledged totals. Daily previews and the narrow
conditional-write exception are specified in
[ADR-053](ADR-053-FOCUS-DAILY-COUNTER-PREVIEWS.md).

View/project/discrete-filter changes start their reads immediately. Only typed
server-side searches retain the 200 ms debounce. Bootstrap and preferences load
concurrently; either request can end an expired session, and initialization still
recovers an existing pairing if the other request is cancelled.

Editor, settings and administrative components load on demand through
`lib/ui/deferred-component.svelte.ts`. Editor code warms immediately after the
initial ordinary view read, without competing for its network transfer, and
loads alongside resource reads on an early click. Once loaded, the registration
browser stays mounted while hidden so its pending command is retained. Loading
failures expose a closable dialog, retry and explicit reload. The explicit reload
revalidates a bounded set of failed local preload assets to clear WebKit's failed
preload cache; it never reloads automatically over a draft. Explicit Calendar/Gantt
routes start their widget import alongside bootstrap through `planning-components.ts`;
the mounted planning view owns errors and the same explicit reload recovery.

`lib/api` owns transport, bounded reads, invalidation batching, typed resource/
planning/tag endpoints and command execution. Feature code should use a named
endpoint when one exists; response types are asserted only at transport boundaries. `lib/contracts` contains generated types; `lib/resources` contains
shared resource presentation; `lib/ui` contains shared rendering and dialog
behavior and the small shared component set. Visual values live in
`styles/tokens.css`; workspace and editor styles consume those tokens. See the
[UI design system](DESIGN-SYSTEM.md) for component and layout ownership.

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

Card and project editors automatically save valid edits, serializing writes
against the last acknowledged source/version while preserving newer typing.
App keeps acknowledged resource routing separate from editor instance identity
so refreshes cannot replace a queued draft. Reports retain explicit submission.
See [ADR-035](ADR-035-EDITOR-AUTOSAVE.md) for queue and recovery behavior.

[ResourceDescription](../apps/web/src/features/editor/ResourceDescription.svelte)
owns Markdown display/editing, focus and pointer transitions. It binds the existing
draft body and tells the editor when editing finishes; the editor retains autosave,
conflict and close ownership. Draft snapshot classification lives with the draft
model, so picker/checklist changes bypass only the typing debounce.

`card-layout.ts` owns sanitized browser-only section ordering; `CardLayoutMenu`
edits that preference without entering autosave. The editor keeps all six sections
in one keyed list so any reorder retains mounted controls and explicit drafts.
The preference reader upgrades the former grouped order into that single list.
`card-schedule.ts` derives relative schedule summaries using the workspace
calendar; `CardPlanningFields` owns the disclosure, whose initial creation state
does not change when the card is first acknowledged. `ScheduleCalendar` stages a
civil date/range in a nested native modal; Apply updates the existing editor draft.
`lib/ui/calendar-dates.ts` owns its timezone-independent date arithmetic. Neither
layout nor calendar selection changes source formats or server preferences.

`CardComments` renders source-owned conversations and an explicit comment draft.
The editor flushes autosave before a conditional append, keeps uncertain comment
commands in the shared controller, and preserves unsubmitted comment text across
ordinary writes. The server owns comment IDs/timestamps, append-only validation
and projections; see [ADR-045](ADR-045-CARD-COMMENTS.md).

`CardCounters` keeps explicit configuration/value drafts in the editor state;
`card-counters.ts` owns daily selection and local increments. Application
`counters.rs` prepares conditional configuration/recording changes inside the
normal writer transaction. See [ADR-049](ADR-049-DAILY-CARD-COUNTERS.md).

All named OpenAPI schemas are exported by contract generation, including inline
unions. New endpoint functions should use these types, as in
[resources](../apps/web/src/lib/api/resources.ts). Extra JSON fields for
milestones and reports remain an explicit user input boundary and are always
validated by the server. Project and card metadata have no extension fields.
Reports target projects or milestones.

### Planning and tag ownership

[PlanningRead](../apps/web/src/features/planning/planning-read.ts) owns one view's
request generation, cancellation and deferred publication during gestures. Calendar
and Gantt keep their own pagination policy. Calendar agenda pages hold 200 items;
grid/time views retain 1,000. The page size participates in read scope, so changing
layout resets an incompatible cursor. Read-only calendar snapshots and widget
events use shallow reactive ownership, with explicit replacement on changes.
Typed widget adapters convert inclusive
domain dates into vendor events/tasks without modifying
source rows. Gantt gesture activity is passed through its instance context.

The calendar's reviewed build transform lives in `apps/web/build`; it is guarded
by exact upstream source hashes and required-module checks. Planning owns its
pass-local geometry and lazy snippet argument helpers. No element measurement
survives a synchronous layout pass. See [ADR-054](ADR-054-CALENDAR-RENDERING.md)
for dependency review and retained rendering behavior.

`TagManager` reads exact labels from the selected project's cards and prepares
one durable rename workflow for that project. The workflow checks source bytes
before each write and retains its command identity through retries. `TagPicker`
suggests labels from the current project. The older workspace vocabulary API
remains available for existing clients but is not used by the current UI.

Project folders are optional project metadata, independent of card labels.
The project editor uses `FolderPicker`; Focus scopes source pins by project
summaries and sends folder filters to paginated list/attention reads. Folder
suggestions come from the bounded projection catalog. See [ADR-043](ADR-043-PROJECT-FOLDERS.md).

## Rust application

`projectd` dispatch explicitly selects summary GETs for `read_response` gzip
negotiation, using the shared encoding-quality parser and admitted blocking worker.
Encoding starts after engine query locks are released, has a 4 MiB input cap and
retains private caching, identity source ETags and credential/SSE exclusions.
See [ADR-052](ADR-052-BOUNDED-SUMMARY-COMPRESSION.md).

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
Registration, workspace mutation and source-dependent ordering operate on
these models. Projection rows and patch envelopes still use JSON where
the schema intentionally varies; this does not replace domain validation.

Source collection scans and consecutive reference checks use a scoped
`CollectionReader`. It retains one collection descriptor, verifies the lease
on every file and checks the approved project and collection identities in one
path walk. File type, link count, size bounds and current bytes remain checked;
there is no source/version cache. A missing collection has a distinct error,
so a missing lease cannot be interpreted as an empty source collection.

Patch preparation composes creation defaults, patch/undo application, placement
resolution and report reference collection as named steps. It produces a candidate
and observed references. Writer
validates the complete candidate, checks source versions again and preserves the
existing durable prepare/write/commit sequence. Original command JSON stays in
the journal. Source serialization retains canonical key ordering; no-op writes
retain the original bytes. The JSON source format is described in [ADR-046](ADR-046-JSON-SOURCES.md).

[Source deletion](../crates/application/src/source_deletion.rs) coordinates card
and report removal through the shared durable writer. Card pins and report
references are checked against source files before unlink and during recovery;
see [ADR-047](ADR-047-REPORT-DELETION.md).

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

Timeline projections use explicitly recorded inclusive card schedules and
milestone dates. Card dependencies, blocked reasons and dependency forecasts
are not part of the current model.

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
