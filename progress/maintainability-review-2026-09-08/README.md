# Maintainability and open-source readiness review

Reviewed on 2026-09-08 at `3057c0f4e20009cb585fbbe82e3bd59c62902c83`.

The architecture is worth keeping. The next improvement should make ownership,
state transitions and contribution paths easier to understand. A rewrite, more
crates or a general framework would add maintenance work without a demonstrated
benefit.

This review evaluates the code **after** the recent architecture refactor. The
older report's missing command controller, monolithic application state and
public storage internals are no longer accurate descriptions of this checkout.
The remaining issues below are refactoring opportunities, not claims of
reproduced data loss or security vulnerabilities. Priorities describe useful
sequencing, not production incident severity.

## Scope and verified baseline

Inspected the five Rust crates, frontend composition and feature modules,
mutation preparation, persistence/recovery interfaces, routing, generated types,
representative unit and transport tests, CI, development instructions and tracked
documentation. This is a source review with an automated baseline, not an
exhaustive line-by-line review or a dependency/security audit.

The full existing `.venv-check/bin/python scripts/check.py` passed:

| Check | Current result |
| --- | --- |
| Rust tests | 120 passed |
| JavaScript tests | 62 passed |
| Python tests | 12 passed |
| Svelte / TypeScript | 0 errors, 0 warnings |
| Rustfmt, Clippy with warnings denied, Prettier | Passed |
| Generated contracts, OpenAPI, examples/package validation | Passed |
| Frontend production build and initial bundle gate | Passed |
| Rust workspace release build | Passed |

Browser E2E, packaged installation, benchmarks and physical-device checks were
not rerun. Local checks do not establish the current remote CI result or complete
release acceptance. Execution evidence is in [checks/local-check.txt](checks/local-check.txt).

The checkout started clean. This review changes no product code, dependencies,
contracts or acceptance status. There is no root `.project/`; none was created
and no project report was written through a bypass. No commit or push was made.

## Foundations to preserve

- Five meaningful crates: domain rules, source storage, application operations,
  daemon/transport and CLI. Domain has no HTTP or filesystem dependency.
- `.project/` source documents, `workspace.json` workspace authority, separate
  operational state and rebuildable search projections. Operational SQLite is
  not disposable in the same way as the index.
- Conditional writes, immutable retry identity, journal/recovery checkpoints,
  source reference checks and explicit uncertainty. This complexity implements
  requirements; removing it for shorter code would be a regression.
- `Validated<T>`, typed source reads and generated TypeScript contracts. The
  recent editor discriminated union and command controller are good examples of
  making invalid combinations harder to represent.
- Plain classes with thin Svelte adapters for command and view-data lifecycles.
  They support useful behavioral tests without importing a rendered component.
- Feature directories, explicit callbacks, scoped UI pieces and substantial
  regression coverage. Strict TypeScript and automatic formatting already solve
  much of the basic syntax/style problem.

## Priorities

| Order | Improvement | Scope / relative effort |
| --- | --- | --- |
| 1 | Make the public repository easy to enter and navigate | Small–medium; publication decisions remain owner-owned |
| 2 | Extract planning lifecycle and tag operation ownership | Medium–large; separate feature-sized changes |
| 3 | Complete typed endpoint boundaries used by features | Medium; migrate incrementally |
| 4 | Make mutation preparation and workflow states explicit | Medium–large; preserve persistence compatibility |
| 5 | Finish diagnostic error classification | Small–medium; prioritize recovery and stored data |
| 6 | Strengthen internal application/transport boundaries | Medium; do alongside related feature work |
| 7 | Improve contribution checks and test discoverability | Small–medium; avoid a new tooling stack by default |

### 1. Curate the public repository

There is no tracked root `LICENSE`, `CONTRIBUTING.md` or contributor-facing
security-reporting document. `docs/07-SECURITY.md` describes system security, not
a reporting process. `README.md` and `DEVELOPMENT.md` exist and are useful, but
`START_HERE.md` still introduces a build handoff and contains obsolete first-session
instructions. Names alternate between Astra and Local Projects.

Of 829 tracked files, 489 are under `progress/`, totaling 31,537,528 bytes. This
is a current tracked-file measurement, excluding ignored builds and local tools.
History and evidence are useful; their volume and competing entry points make
the maintained product harder for a new contributor to find.

Before inviting outside contributions:

- Have the owner select the project license and add the corresponding root file
  and package metadata. Dependency license notices are a separate concern.
- Add a short contribution guide: setup, smallest useful checks, where features
  belong, contract-change requirements and one realistic change walkthrough.
- Provide an explicit security-reporting route and clarify maintenance/release
  expectations. Use small issue/PR templates only where they save review effort.
- Choose a consistent public product name; document retained binary names instead
  of renaming protocols and binaries merely for cosmetic consistency.
- Make README the primary entrance. Keep maintained architecture and invariants
  easy to reach; distinguish historical handoff/evidence from current guidance.
- Retain unresolved requirements and concise evidence summaries. Archive obsolete
  narratives in an explicitly historical location; keep future bulk logs and
  screenshots in ignored output/CI artifacts as the existing policy prescribes.
  Do not rewrite Git history or delete unresolved acceptance evidence for tidiness.

**Done when:** a contributor can determine what the project is, how to run it,
where to change one feature and how to verify it without reading agent handoffs.
An archive directory alone is insufficient if the same obsolete instructions
remain the recommended entry point.

### 2. Extract remaining feature lifecycles, not arbitrary chunks of markup

Current component sizes are descriptive, not pass/fail limits:

| Component | Total lines | Script lines | Style lines |
| --- | ---: | ---: | ---: |
| `App.svelte` | 894 | 463 | 0 |
| `Board.svelte` | 633 | 426 | 111 |
| `CalendarView.svelte` | 763 | 402 | 229 |
| `GanttView.svelte` | 801 | 380 | 186 |
| `TagManager.svelte` | 814 | 364 | 183 |
| `Editor.svelte` | 691 | 386 | 0 |

For example, [Gantt loading](../../apps/web/src/features/planning/GanttView.svelte#L229)
and [calendar loading](../../apps/web/src/features/planning/CalendarView.svelte#L175)
each manage generations, cancellation, deferred refresh, current scope and
pagination while also integrating a vendor widget and handling interaction.
The similarity concerns lifecycle mechanics; their pagination semantics differ.

[TagManager](../../apps/web/src/features/tags/TagManager.svelte#L166) combines
catalog commands, rename/merge preview, per-card command instances, partial
completion, session loss, draft export and rendering. Its existing helpers and
shared command controller do not yet own that whole feature lifecycle.

Extract a planning read owner first: scope, cancellation, latest-result ownership
and deferral while a gesture is active. Let calendar and Gantt retain their own
page policy and widget translation. Extract tag review/batch orchestration into
a feature-specific owner using the existing `CommandController` per operation.
Use explicit states for review/apply/finish where they eliminate invalid
combinations of flags. Keep access availability separate from command outcome.

Move Gantt task/calendar event mapping into typed vendor adapters. Scope gesture
notifications through feature context or callbacks: the current
[global gesture events](../../apps/web/src/features/planning/date-gesture.ts#L42)
and Gantt window listeners create a hidden relationship between instances. This
is primarily a future composability concern, not proof of a present collision.

App already delegates session, routing and data correctly. Its next extraction
should be cohesive workspace content and overlay presentation, if that makes
feature changes local. Do not put every boolean into a global store or move all
463 script lines into an equally coupled controller.

**Done when:** tests can exercise stale responses after a scope change, refresh
during a gesture, cancellation/unmount, partial tag completion and lost replies
without mounting the whole workspace. Browser regressions still verify vendor
events, keyboard alternatives, draft preservation and dialog behavior.

### 3. Finish typed endpoint boundaries

[resources.ts](../../apps/web/src/lib/api/resources.ts#L17) demonstrates a useful
typed endpoint layer. However, features still construct paths and choose their
own response types directly. Examples include calendar/Gantt view requests,
TagManager catalog reads and App resource loading.

The generic [api<T>()](../../apps/web/src/lib/api/api.ts#L92) ultimately returns
`value as T`; its type parameter does not connect a path to the endpoint contract.
It is acceptable as a low-level transport assertion, but using it throughout
features means a wrong response type can compile. Some declarations also have
accidental dependencies: `Resource` is derived from a command response rather
than an explicitly named resource union.

Add named endpoint functions for the routes actually used, with generated input
and output types and centralized query serialization. Group them by resource or
feature when the existing file becomes crowded. Keep raw transport for genuinely
generic use; do not hand-write another complete copy of OpenAPI or introduce a
custom client generator before ordinary wrappers stop being sufficient.

Runtime decoding is a separate decision. At minimum, preserve explicit decoding
of command outcomes and useful malformed-response errors. A full client-side
schema validator for every response is not a prerequisite for this cleanup.

**Done when:** a feature cannot claim that a calendar endpoint returns a tag
catalog; request-shape changes fail in the endpoint layer or its callers. Add
negative type assertions for wrong payloads and behavioral tests for path/query
encoding. Retain unknown extension fields and exact retry payloads.

### 4. Give backend decisions explicit types and focused preparation steps

The application now reads validated sources, but
[mutation prepare](../../crates/application/src/mutation.rs#L143) still handles
creation defaults, set/clear patches, undo, ordering, dependency graphs and report
references in one function. Dynamic JSON is reasonable for patches and `x-*`
extensions; it is less helpful for interpreting stable business decisions over
and over.

Extract cohesive steps such as applying a patch, resolving placement and
collecting report references. Pass named inputs/results and retain one clear
orchestration sequence. The final writer validation and reference/version
recheck must remain authoritative. Do not distribute locks among these helpers.

[Workflow plans](../../crates/application/src/workflow.rs#L80) use `kind: String`,
`view: Value` and `approved_root: Option<Value>`. Startup and maintenance then
interpret fields such as `display_path` through string lookups. Journal methods
also accept/return string states. Introduce `WorkflowKind`, command/job state
enums and typed operational context at decoding boundaries. Begin with states
and fields involved in branching; wrapping every ID/string adds much less value.

Preserve current database strings, saved plan JSON, command digests and replay
identity. Prefer typed views over existing representations where necessary.
Do not accidentally introduce a persisted-format migration through derived
serialization. Source migration tooling remains out of scope under the owner
decision.

The `unwrap()` calls are not all bugs: many occur after schema validation or
construction of known JSON. Their disadvantage here is that the safety argument
lives elsewhere. Improve the boundary before mechanically replacing every
unwrap with a vague error or default.

**Done when:** a new workflow/state is checked exhaustively; placement/report
rules can be tested independently; existing serialization, no-op bytes, conflict,
unknown-field preservation, replay and crash-recovery tests still pass.

### 5. Finish error classification and explain best-effort failures

The new `StoredData`, `SourceValidation`, `LockPoisoned` and `Invariant` variants
are a substantial improvement. Nevertheless, application source still contains
56 occurrences of `AppError::State`. This is a search count, not 56 proven bugs.

Examples include [workflow plan decoding](../../crates/application/src/workflow.rs#L133),
workspace recovery and Gantt stored JSON parsing. Mapping all these to `State`
loses the operation and sometimes the original cause. The transport intentionally
sanitizes errors, which is good, but generic internal errors also reduce the
usefulness of its safe diagnostics.

Convert stored-data and invariant failures at their source with static operation
labels and retained causes. Audit ignored results in startup/recovery separately
from ordinary cleanup. For instance,
[workflow acceptance](../../crates/application/src/workflow.rs#L270) can correctly
return an accepted job while its execution is blocked and recorded in the
journal; replacing that ignored result with `?` changes protocol meaning.
Document this distinction and expose a safe diagnostic where a secondary
failure would otherwise disappear.

**Done when:** representative corrupt operational records and failed recovery
steps identify their subsystem without logging document contents, paths or
credentials; accepted/uncertain/committed semantics remain unchanged.

### 6. Tighten internal boundaries as the application grows

The public Engine facade protects storage from transports. Inside the application,
however, 17 `impl Engine` blocks share the same crate-visible handles. A textual
search finds 32 `self.journal.db()`-style call sites, including direct state SQL
in feature modules. Module separation is useful, but it does not yet restrict
which subsystem owns a persistence transition.

Move repeated command/job persistence operations behind narrowly named Journal
or workflow methods. Keep SQL for complex projection reads near those readers.
Where a feature only needs a store snapshot and journal, pass those dependencies
explicitly instead of making every helper another Engine method. Existing
`Writer` and `Workflows` are good precedents. No repository trait, dependency
injection container or extra crate is justified just to hide concrete SQLite.

[Transport dispatch](../../crates/projectd/src/dispatch.rs#L42) is a 512-line file
with one large route match. This is currently comprehensible and lower priority.
If routes grow, retain a visible route inventory while delegating endpoint
families to typed handlers. Keep common browser/Unix admission and authorization
in one place. Do not build a second routing framework or blindly replace this
with framework extractors that change rejection semantics.

`Reply.http_status` also couples application outcomes to HTTP. Since the CLI
shares this protocol, that is an intentional, tolerable compromise today. Only
separate semantic outcomes from wire replies where it concretely improves tests
or supports a new adapter; a full protocol-neutral rewrite is unnecessary.

**Done when:** a new card rule normally changes its rule/command module and tests,
not journal SQL or generic dispatch; lock order and transaction boundaries remain
auditable in the calling sequence.

### 7. Make verification easier to navigate and architecture harder to erode

The existing checks are substantive: subprocess durability, real transports,
behavioral JS tests, generation drift checks and a two-platform CI matrix.
There is no basis here for calling the project untested. A test count does not,
however, measure coverage, and no coverage percentage was established.

Frontend unit tests live under `scripts/tests/` as `.mjs` files importing actual
TypeScript modules. This is a lightweight, reasonable setup. Their fixtures are
outside the app's TypeScript include set, so those fixtures do not receive the
same compile-time contract checking. Application tests use white-box inclusion
from `tests/` with automatic integration discovery disabled; this preserves
encapsulation but is surprising without guidance.

Document ownership and small test commands in CONTRIBUTING. Group or colocate
feature tests when editing those features; avoid a mass move solely for uniform
paths. Add a small set of public-facade application scenarios using the exported
API, while keeping white-box crash injection private. Add type-checked contract
fixtures only where compile-time shape protection is the purpose of the test.

Consider a narrow import-boundary check: shared API/contracts/UI modules should
not import feature components; cross-feature implementation access should be
deliberate. This protects the documented architecture. Do not adopt a large lint
preset just to enforce stylistic preferences already settled by Prettier/rustfmt.

**Done when:** contributors know the smallest meaningful check for a change and
the release gate; extracted lifecycle tests assert user-visible invariants,
not source strings or the exact arrangement of helper functions.

## A practical change sequence

1. Public documentation and repository curation, with license/name decisions
   made by the owner. Keep unimplemented requirements traceable.
2. Typed planning/tag endpoints, then one planning lifecycle extraction. Validate
   the abstraction on the second planning view before extending it to Board.
3. Tag review owner, preserving each card's independent command identity and
   explicit partial completion.
4. Backend state enums and diagnostic context, then focused mutation helpers.
   Separate serialized-state changes from behavior changes and verify old records.
5. Internal persistence operations and transport family extraction only where
   the next feature demonstrates the need. Refine App presentation last.

Each change should have one reviewable responsibility and a concrete behavioral
check. Pure frontend refactors need type checks, targeted unit/browser regressions
and production build; persistence refactors also need replay and subprocess
durability tests. Run the full existing gate before merging the series.

## What would make the code worse

- Replacing the current stack or splitting the application into more deployables.
- A universal CRUD/workflow/form engine for features with different semantics.
- A one-file-per-function rule, arbitrary line limits or barrel exports everywhere.
- Broad `utils`, `helpers` or global stores that hide who owns state.
- Deleting validation, reference observations, fsync or uncertain-command handling
  because they look repetitive.
- Replacing every branch with dense functional chains or clever generic types.
- Treating every small helper as waste. `editor-actions.ts` is tiny, but its named
  intent models a real distinction; merge such files only if navigation improves.
- Writing more overlapping audit narratives without maintaining one current
  architecture/contribution guide and clearly historical evidence.

The standard to aim for is locality of change: a maintainer can explain an
operation's inputs, owner, state transitions and failure behavior without tracing
unrelated screens or persistence internals. This repository is close enough to
achieve that through focused, incremental work.
