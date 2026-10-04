# Code structure and ownership

Start with [Architecture](ARCHITECTURE.md) for the runtime diagrams, storage model
and repository map. This page describes the maintained module ownership.
Source formats and HTTP behavior
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

Features live under `apps/web/src/features/`: workspace, editor, cards, charts, board,
planning, tags, session, settings, registration and host diagnostics. Import the
specific module needed; there are no catch-all feature barrels. Cross-feature
UI actions use explicit props/callbacks.

Workspace [screens](../apps/web/src/features/workspace/screens) own focus,
project overview, resource lists, updates and the workspace board overview.
`WorkspaceNavigation` owns the compact phone bar and its More disclosure;
[navigation layout](../apps/web/src/features/workspace/navigation-layout.ts)
normalizes browser-local view order and bar visibility without writing workspace
preferences or changing routes. The desktop sidebar retains all views.
Navigation exposes a read-only route and explicit actions; only navigation owns
the generation and abort signal that cancel obsolete resource reads and history
restoration. A successful source read transfers its loaded editor target; view
navigation does not cancel context already owned by a mounted editor.

The charts feature owns Chart's bounded counter-series reads, selection,
aggregation, statistics and SVG plots. `chart-data.ts` owns cancellation,
generation checks, stale-page restart and invalidations received during active
reads; workspace view revisions trigger refresh without replacing browser-local
chart choices. `chart-model.ts` keeps quantity and valuation calculations separate
from rendering. The Chart component loads on demand and uses the named counter
endpoint in `lib/api/counters.ts`.

Focus reads its pinned summaries with the ordered membership snapshot. Missing
retained references become unavailable placeholders; older hosts without summaries
use the existing bounded detail-read path. Opening a card still reads its current
source before editing. See [ADR-051](ADR-051-FOCUS-SNAPSHOT-SUMMARIES.md).
The bounded daily Focus pages use the same snapshot counter projection as pins,
including the observed workspace day and source version without counter histories.
`PinnedCard` also presents the daily plan/event sections without pin gestures
and avoids duplicate overdue badges. It separates the opening/reordering surface from `FocusCounterChip`.
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

An existing resource still requires its current source read before editing.
[Editor opening](../apps/web/src/features/editor/editor-opening.ts) starts the
source transport first, then its fresh project and card-tag reads alongside it,
opting into synchronous transport startup when a GET pool slot is free. Optional
context must not start transport ahead of the authoritative source. Only the
successful current source can create a target and transfer its context reads. Failed or
superseded openings cancel their reads; closing/replacing the target, session
loss and application disposal release its remaining context. New drafts retain
their ordinary context reads before native modal layout. Other reads
retain their existing microtask cancellation window, including transient Calendar
mode/range queries. Queued reads retain the same concurrency, cancellation and
deadline bounds. Shared response/subscriber ownership is installed before startup,
including reentrant reads and synchronous cancellation. Opening context is
consumed once. A tag change before the Labels catalog takes its request discards
that catalog without cancelling the current source; Labels then reads fresh
tags. After handoff, Labels owns its existing generation checks for invalidation,
retries and session restoration. No source response or catalog is retained across
editor instances. Network work and modal rendering can overlap.

Calendar pointer proposals use `DateChange` automatic submission. Only failures
show the recovery dialog; command identity and version semantics are unchanged.
Native Calendar gesture completion republishes canonical event snapshots so
widget mutation cannot leave a retained month projection hidden.
`timeline-order.ts` owns project-scoped browser presentation order; `TimelineRow`
and `timeline-row-gesture.ts` own accessible row grips and cancelled previews.
The final Timeline row creates an ordinary dated card draft.

Calendar, Gantt and Board subscribe through scalar read scopes. Republishing an
identical route or editing a loaded-title filter does not request the same page
again; actual query changes and planning revisions still read current data.
Their read owners retain queued invalidations during active reads and gestures,
including a fresh follow-up when source data changes while an earlier request is
unfinished.

`lib/api` owns transport, bounded reads, invalidation batching, typed resource/
planning/tag endpoints and command execution. Feature code should use a named
endpoint when one exists; response types are asserted only at transport boundaries. `lib/contracts` contains generated types; `lib/resources` contains
shared resource presentation; `lib/ui` contains shared rendering and dialog
behavior and the small shared component set. `lib/ui/motion.ts` owns bounded
scene entrances, bounded inner card layers, measured navigation selection and live reduced-motion cleanup;
`lib/ui/motion-layers.ts` owns bounded heading/content/detail sequences for native
layers and workspace controls, with explicit per-opening keys and cleanup;
features supply their navigation keys and readiness without changing read lifetimes. Visual values live in
`styles/tokens.css`; workspace and editor styles consume those tokens. See the
[UI design system](DESIGN-SYSTEM.md) for component and layout ownership.

`lib/ui/reorder-gesture.ts` owns the shared vertical pointer preview lifecycle;
Focus, checklist, card-layout and Timeline adapters own snapshot identity,
measured destination bounds and their existing commit actions.
`gesture-cancellation.ts` also serves Board, date and counter gestures, while
`popover-position.ts` measures every `ActionMenu` against its trigger and visual
viewport. Native modal registration, Escape routing and return-focus lineage
remain in `dialog.ts`. Shared UI modules never own feature writes.

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
edits that order without entering autosave. `card-layout-gesture.ts` owns handle
drag previews, cancellation, panel scrolling and keyboard moves. The editor keeps
all six sections in one keyed list so reorders and visibility changes retain
mounted controls and explicit drafts. The preference reader upgrades the former
grouped order into that single list. Visibility is the source-owned card field
`hidden_sections`, edited through ordinary autosave; see
[ADR-056](ADR-056-CARD-SECTION-VISIBILITY.md).
`card-schedule.ts` derives relative schedule summaries using the workspace
calendar; `CardPlanningFields` owns the disclosure, whose initial creation state
does not change when the card is first acknowledged. `ScheduleCalendar` stages a
civil date/range in a nested native modal; Apply updates the existing editor draft.
`lib/ui/calendar-dates.ts` owns its timezone-independent date arithmetic. Neither
section reordering nor calendar selection changes source formats or server preferences.

`CardComments` renders source-owned conversations and an explicit comment draft.
The editor flushes autosave before a conditional append, keeps uncertain comment
commands in the shared controller, and preserves unsubmitted comment text across
ordinary writes. The server owns comment IDs/timestamps, append-only validation
and projections; see [ADR-045](ADR-045-CARD-COMMENTS.md).

`CardCounters` keeps explicit configuration/value drafts in the editor state,
including incomplete numeric input. `CounterRow` owns compact value entry and
history disclosure, reusing the same horizontal scrub action as pinned counters.
`counter-trend.ts` selects fourteen civil days; `CounterTrend` renders saved
totals without treating missing entries as zero. `card-counters.ts` owns daily
selection, bounded local values and numeric draft validation. Application
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
The calendar adapter retains event identity only for its displayed page and
compares every version/projection field after each ordinary read. Identical pages
avoid another widget normalization/layout pass; changed metadata, editability,
order and membership still publish. This does not cache source-read authority.
Typed widget adapters convert inclusive
domain dates into vendor events/tasks without modifying
source rows. Gantt gesture activity is passed through its instance context.

`CalendarToolbar` composes the shared buttons, icons and date disclosure. It emits
navigation and creation callbacks; `CalendarView` retains route integration,
versioned reads, paging, gesture guards and date proposals. Calendar presentation
does not replace or cache the source projection. `calendar-motion.ts` supplies
bounded native grid/event-group layers to the shared readiness-aware sequence.
Project/date/widget-view keys start entrances only after the current page is
ready; refreshes and writes retain the sequence. Native events are never animated
individually, and the month popup's opacity layers preserve positioning/gestures.

The calendar's reviewed build transform lives in `apps/web/build`; it is guarded
by exact upstream source hashes and required-module checks. Planning owns its
pass-local geometry, hidden-list collection and lazy snippet argument helpers.
The hidden collector publishes one new array per changed day and retains
unchanged list identity. Cell lookup and cell/span capacity share only that
pass's measured geometry. The numeric date predicate reads current normalized
Date values and retains native exclusive bounds/resource filtering. No date
value, element measurement or duplicate-membership set is reused by another
synchronous layout pass. The month grid retains all native
chunk models, but mounts interactive components only for visible events and
reviewed equal-height snippet shapes. Each pass measures the actual native
representatives and uses native positioning. The main keyed loop contains only
these representatives and visible events, with their original full-array indices.
All chunk models retain membership and current projection versions; no main-grid
placeholder nodes are created for other hidden events. Unknown shapes/styles use
the native renderer. Popup rows remain complete; known Astra rows use
`CalendarPopupEntry` with the existing content snippet and native Resizer. Custom
content/styles/resources and extension hooks retain the original Event stack.
The build plugin guards these private vendor boundaries and reexports the native
helpers through a private alias. Preview components remain native. Size observers
schedule a shared frame;
their previous notification sizes never supply layout geometry. Leaving measured
rendering evicts retained placements. See [ADR-054](ADR-054-CALENDAR-RENDERING.md)
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
`focus_preview.rs` maps the bounded membership snapshot into the optional Omarchy
widget's first five rows. It uses the CLI's checked Unix transport with a smaller
response/time budget; only reference-only hosts read card details. Unverified rows
remain unavailable. The widget consumes the CLI envelope and retains its ordinary
process/watchdog ownership; the separate window activation helper remains Python.
See [ADR-057](ADR-057-FOCUS-WIDGET-READER.md).

[Engine](../crates/application/src/engine.rs) owns storage handles and application
services. HTTP and the CLI cannot access its journal, index or operation gate.
The [service facade](../crates/application/src/service.rs) exposes command status,
authentication, job queries, subscriptions and maintenance operations. Journal,
writer, workflow and index implementation modules are private to the crate.

[Profile ownership](../crates/application/src/users.rs) retains the durable user
registry and creation recovery in the root journal. The default Owner reuses the
existing engine; additional engines live in `users/<uuid>/` below the same data
directory. HTTP/Unix routing chooses an engine by `X-Astra-User`, and SSE uses
`user_id`; pairing stays with the root engine. Each engine keeps its ordinary
workspace, roots, command journal, receipts, history and index. The
[shared host state](../crates/application/src/shared.rs) supplies one operation
gate and a project-store pool to all engines before recovery. Source folders
registered by several profiles retain one writer lease and mutex, and journal
readers enforce project-wide pending recovery. Shared source Focus checks every
participating workspace; deletion/relocation requires sole membership.
Missing ready state is rejected rather than initialized. The host watches all
ready engines, and stopped-copy restore rotates all their epochs. See
[ADR-060](ADR-060-TRUSTED-USER-PROFILES.md).

[Profile renaming](../crates/application/src/users/rename.rs) validates an
observed registry version and commits name and command result in the root SQLite
transaction. IDs and original command scopes stay stable. See
[ADR-061](ADR-061-SHARED-PROFILE-PROJECTS.md).

Browser transport freezes the selected profile per tab and retains it in command
identity, including uncertain status/retry paths. Profile creation overrides that
scope with the root user and root epoch. Settings owns creation and explicit
switching; the top-level component guards open drafts/operations and reloads only
the switching tab. The header displays its current profile. Existing tabs retain
their selection, while new tabs use the browser's last choice.

[Source reads](../crates/application/src/source.rs) return validated documents
with their original byte versions. Workspace reads return `Versioned<Workspace>`.
Registration, workspace mutation and source-dependent ordering operate on
these models. Projection rows and patch envelopes still use JSON where
the schema intentionally varies; this does not replace domain validation.
The store's canonical metadata-size check sends the ordinary pretty-JSON
serializer to a byte counter instead of retaining its output buffer. The exact
limit and parsing/error order remain; actual source serialization and byte
versions still use the existing canonical/source bytes. See
[ADR-046](ADR-046-JSON-SOURCES.md).

[Agent context](../crates/application/src/context.rs) reads current source-backed
candidates and assembles the existing budgeted response. A request-local compact
JSON byte total accounts for appended values, array commas and count digit changes.
The initial envelope and final complete response retain ordinary serialization;
accepted/rejected entries, caps, complete metadata and next-read hints keep their
existing semantics. There is no source or response cache. See
[ADR-058](ADR-058-EXACT-CONTEXT-BUDGET.md).
Consecutive context candidates of one kind borrow a request-local collection
reader; the next kind opens its own reader. A failed open retains ordinary
per-candidate lookup rather than caching a source failure. Every candidate still
uses current guarded bytes and the common parser. Readers end with the request;
replaced collections are rejected within a held reader and reopened by later
requests. See [the scoped-read decision](ADR-055-BOUNDED-SOURCE-READS.md).

Context entries borrow the body from that validated typed document and serialize
only its metadata. Selected metadata values move into the response; the complete
body is not copied into a temporary JSON envelope before taking its UTF-8 excerpt.
Every kind retains the existing title/status mapping, optional fields and complete
structured metadata. This is response assembly after the ordinary source checks,
not a partial parser or source cache.

Source collection scans and consecutive reference checks use a scoped
`CollectionReader`. It retains one collection descriptor, verifies the lease
on every file and checks the approved project and collection identities in one
path walk. File type, link count, size bounds and current bytes remain checked;
there is no source/version cache. A missing collection has a distinct error,
so a missing lease cannot be interpreted as an empty source collection.
For a collection file, lease lookup opens the fixed `.local` child relative to
the held project descriptor with `NOFOLLOW`, then checks the locked inode and
link count. The following source read still walks the current absolute path and
verifies both project and collection identities before opening any source bytes.
This removes a duplicate lease-path traversal without caching a path check.

The application collection helper keeps small collections sequential. At 256
recognized filenames it can use up to four scoped readers, limited by CPU
parallelism and one process-wide nonblocking capacity guard. Contention or a
thread-start failure uses the same guarded sequential reads. The caller retains
its project lock/lease; workers borrow the reader and all finish before the
ordered result or first source error is returned. There is no new queue or source
cache. See [ADR-055](ADR-055-BOUNDED-SOURCE-READS.md).

Source-backed pin admission, ordering and agent context use `visit_collection`
over the same bounded ordered visitor as tag reads. Only up to 101 pin ID/position
pairs per project survive a source observation. Every recognized file is still
validated before the 50,000-source and 100-pin checks; sorted source errors,
archived membership, registration/position order and workspace ranking remain.
This removes full parsed-body retention, with no membership or version cache.

The tolerant tag scanner also borrows one `CollectionReader` per project and
uses the source module's common guarded single-item parser. At 64 readable
filenames, `visit_ordered` uses the same capacity guard and up to four workers,
with capacity-one result channels. The caller consumes source observations in
sorted order, retaining at most nine results at four workers; no full parsed
collection is retained. Projects remain sequential under their existing locks.
The scan bounds sorted names before validity filtering, so invalid identifiers
still consume the budget and ordered issues remain bounded. Catalogs/previews
read current bytes and versions independently of the suggestion index; a missing
collection remains distinct from a missing or replaced lease.

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

Focus Attention reads shared report receipts before taking the index snapshot;
their ordered serialization still contributes to cursor identity. The private
receipt predicate in `views/attention.rs` builds project/report hash membership
on its first use from that exact snapshot. Borrowed row identities avoid repeated
concatenation and tree lookups. The predicate accepts only direct application SQL;
it has no I/O, SQL or nested locks. Its statements/results end before explicit
removal under the same index lock; errors also remove it and cleanup failure
cannot return success. No set is built when decisions fill the requested prefix
or no unread rows are examined. The query keeps only the first
`offset + limit + 1` eligible unread reports, saturating at SQLite's signed limit.
The ordered non-decision report index avoids sorting a whole project before that
prefix. Startup installs it before admitting reads, including older projections.
This is safe because unread reports share their weight, date and reason, and use
the same project/ID order as the final mixed page. Eligibility and scope checks
precede that prefix; overdue items, unresolved decisions and review items retain
their existing rules. Receipt membership precedes further unread-row eligibility
checks. Review and decision branches select their existing partial indexes so
unrelated statuses/kinds do not cause full scans. `Index::open` installs these
indexes before reads, including on an older projection. Decision closure membership
is built once in the same statement from resolution edges and correction targets,
using the existing report-kind index. Membership includes both project and report
ID, ignores nonmatching NULL edges and preserves direct closure even when a
resolution is later corrected. Eligible decisions retain the same sufficient
ordered prefix as unread reports. When that decision prefix alone fills the
requested prefix, lower-priority unread rows cannot enter it and are not queried.
Membership and prefixes last only for this request. Receipts remain durable
journal state, never an indexed source or a retained application cache.
Attention reason branches and the shared event-boundary query check date/kind
eligibility before the more expensive active/project checks. The boundary still
includes exactly the qualifying ended events used for cursor invalidation.

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
