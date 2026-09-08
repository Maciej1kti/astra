# Code health and optimization audit — 2026-09-08

Revision: `171663744338efe8a3f0d23c10d610d6841086f8`.

The largest opportunities are reducing unnecessary reads, fixing a few bounded
correctness defects, and making the existing regression coverage repeatable.
The basic architecture and ordinary indexed-query/write performance are sound.
An architectural rewrite or replacement of the planning libraries is not justified
by this audit.

This is an analysis deliverable. Application code, contracts, dependency versions,
user data and acceptance statuses were not changed. Evidence and small synthetic
reproduction programs were added only to this directory. The checkout has no
root `.project/`; none was initialized and no project report was written directly.

## Measured baseline

| Check | Current result | Evidence |
| --- | --- | --- |
| Generated contracts, package validation and OpenAPI | Pass | [Initial checks](checks/full-check.txt) |
| Python validation/installer tests | 4 passed | [Initial checks](checks/full-check.txt) |
| JavaScript unit tests | 32 passed | [Initial checks](checks/full-check.txt) |
| Svelte/TypeScript | 0 errors, 0 warnings | [Initial checks](checks/full-check.txt) |
| Rust formatting and Clippy with warnings denied | Pass | [Initial checks](checks/full-check.txt) |
| Rust workspace tests | 92 passed | [Rust rerun](checks/rust-tests.txt) |
| Additional Omarchy helper tests | 8 passed | [Omarchy checks](checks/omarchy-tests.txt) |
| Release workspace build | Pass | [Build](checks/release-build.txt) |
| Standard application workload | 100 projects, 10,000 cards, 50,000 reports | [Release measurements](checks/benchmark-standard.json) |

The original aggregate check stopped because the sandbox prohibited Unix socket
creation in two CLI tests. The complete Rust suite was then rerun successfully
with permission outside the sandbox, followed by the remaining release build.
The initial aggregate log therefore intentionally retains its failed environment
attempt; it is not evidence of a product test failure or of a single green run.

The release workload used 20 warmup iterations and 200 measured samples per
operation. Query p95 was **20.86 ms**, attention p95 **31.39 ms**, and durable
mutation p95 **111.11 ms**. These fit the current 50 ms query and 150 ms write
budgets. Engine initialization took **8,301.5 ms**, followed by a separate full
reconciliation of **4,975.6 ms**. The fixture initializes the large source dataset
after registration, so this startup result is not a measurement of reopening a
fully reconciled, unchanged large index.

The environment was macOS arm64 with Node 24.11.0 and Cargo 1.92.0;
[environment details](checks/environment.json) record unavailable CPU/RAM fields.
Application timings exclude HTTP, VPN, browser rendering and measured steady-state
RSS. The existing benchmark does not cover Gantt, tag discovery, card-history
loading or concurrent clients. No full browser suite or physical-device test was
rerun for this analysis. A separate transport smoke was not completed: the
sandbox prohibited listener binding and its escalation was canceled. Its temporary
state was cleaned up and no owned daemon was left running. Static transport
findings below do not claim a successful runtime reproduction.

The production entry JS and CSS total approximately **115.5 KiB gzip**; Gantt,
Calendar and Board are separate chunks. This is below the 300 KiB compressed
startup budget. Compression estimates from the build do not establish what the
HTTP server actually sends. Exact file sizes are in [metrics](checks/metrics.json).

## Findings and recommended changes

Priorities: **P1** = a reproducible failure worth fixing before broad refactoring;
**P2** = a concrete performance, maintainability or regression-protection issue;
**P3** = repository hygiene. Effort describes scope, not a promised duration:
small = local change, medium = several modules, large = lifecycle/contract work.

### 1. P1 — Invalid filenames can make an otherwise readable project unavailable

**Source:** `crates/application/src/index.rs:298–304, 433–440`.

Invalid UUID filenames are recorded using only the basename, whereas invalid
document contents use their collection-relative path. Therefore `cards/foo.md`
and `milestones/foo.md` both insert the same `(project_id, path)` issue key.
The second insert violates the primary key and causes the project refresh to fail;
the application then marks the project's projection unavailable. The linked Rust
library reproduction confirms this behavior. One invalid filename also changes
the issue count without changing the event cursor or emitting a health event.

**Change:** consistently record collection-relative paths, compare old/new issue
sets, and publish health invalidation when diagnostics change. Preserve isolation
of malformed documents and readable neighboring resources. **Effort: small/medium.**

**Acceptance:** two same-named malformed files yield two separate diagnostics;
healthy cards remain readable; adding/removing an issue emits the expected health
event without rewriting source files. Add the regression before the fix.
[Reproduction and SQL evidence](checks/backend-probes.txt).

### 2. P1 — A card's history fails when unrelated project reports exceed 20,000

**Source:** `apps/web/src/lib/CardActivity.svelte:33–42, 89–111`;
`apps/web/src/lib/api.ts:209–224`; `crates/application/src/index.rs:21–31`.

Card activity downloads all project reports and filters by card only afterwards.
The shared `all()` helper stops at 100 pages of 200 records and throws away the
result through an error. A card with only a few reports can therefore have an
unavailable history because other cards generated many reports. The helper probe
confirms 100 requests, 20,000 fetched items, then an error. Rendering the complete
filtered history can also create up to 20,000 entries without a separate DOM/page
bound.

**Change:** add server-side target type/ID filtering and paginated card activity;
load report bodies only when opened. Keep the defensive `all()` bound. This needs
matching OpenAPI/schema, examples, generated contracts, tests and an ADR, rather
than a client-only workaround. **Effort: medium.**

**Acceptance:** a project with more than 20,000 reports shows the selected card's
first history page with one bounded query; paging has no missing/duplicate entries.
[Helper evidence](checks/frontend-bounded-probes.json).

### 3. P2 — An event refreshes unrelated views and discards current pagination

**Source:** `apps/web/src/App.svelte:356–420, 460–470`;
`apps/web/src/lib/api.ts:88–106`; `apps/web/src/lib/Board.svelte:107–123`.

Every refresh fetches projects, focus, attention, cards, milestones and reports.
Missing pinned cards are fetched sequentially. The generation check happens only
after all this work. SSE handlers ignore the event target and call the same refresh;
the result resets list pagination and increments a revision that triggers the
planning components' own queries. Read concurrency is bounded, but obsolete work
can still occupy the queue. A trailing 150 ms debounce without a maximum wait can
also postpone refresh throughout a sustained stream of more frequent events.

**Change:** extract view-specific query loading and SSE invalidation from the app
shell; share in-flight requests, cancel obsolete GETs, fetch missing focus details
with bounded concurrency, and bound debounce delay. Scope invalidation to active
views and affected shared data. Preserve draft and gesture rules; never apply
read retry/cancellation behavior to uncertain mutations. **Effort: medium.**

**Acceptance:** count requests after one card change and a sustained event burst;
verify current filters/page, eventual freshness and rapid project navigation.
Handle server cursor invalidation explicitly instead of reusing a stale cursor.

### 4. P2 — Opening an editor scans entire collections twice for suggestions

**Source:** `apps/web/src/lib/Editor.svelte:163–179, 255–259, 704–717`;
`apps/web/src/lib/TagPicker.svelte:35–46`;
`crates/application/src/tags.rs:66–89, 189–256`.

The editor fetches every active card, archived card and milestone to build a
relation-name map and tag suggestions. TagPicker separately requests the workspace
catalog, which itself scans and parses source cards across projects, up to 50,000.
This work repeats on mounting editors even when only a few relation names are needed.

**Change:** resolve only existing dependency/milestone IDs; use the existing bounded
search for new relations; share tag suggestion data and in-flight catalog reads
with explicit freshness/invalidation and session cleanup. **Effort: medium.**

The fresh source scan is deliberate in `docs/ADR-028-WORKSPACE-TAGS.md`: it finds
unindexed external edits. Keep fresh validation for management/rename previews.
Replacing that endpoint with a stale index would change its contract. A separate
suggestion projection is an option only if its freshness is made explicit.

**Acceptance:** opening one card scales with its relationships, repeated openings
reuse suitable suggestions, archived relation names survive, and fresh rename
preview still discovers externally edited labels with original source versions.

### 5. P2 — Gantt edge preparation has quadratic cost in the frontend

**Source:** `apps/web/src/lib/GanttView.svelte:60–109, 155–158`.

Visible edges scan task arrays repeatedly; hidden edges scan the full visible-edge
array for every edge. Complexity is O(E×V + E²). A synthetic valid graph with 200
cards and 14,950 edges took **205.7–423.8 ms** for these expressions alone. A Set
plus one partitioning pass produced identical outputs in **0.92–1.43 ms**.
These are three pure-JavaScript samples, not browser latency or an expected gain
for an ordinary sparse project.

**Change:** partition edges once using a Set of task IDs; use a Map for forecast
lookups instead of repeated `find()`. No new dependency is needed. **Effort: small.**

**Acceptance:** preserve edge order, hidden predecessors, undated cards, filters
and forecast behavior; then measure a rendered dense graph.
[Reproducible probe](checks/frontend-bounded-probes.mjs).

### 6. P2 — Backend Gantt repeats graph work and holds the shared index lock

**Source:** `crates/application/src/views.rs:120–151`;
`crates/application/src/index.rs` (`with_snapshot`).

Each page analyzes up to 10,000 project cards, then performs one additional SQL
query for every returned dependency. It also scans page rows repeatedly to classify
off-page edges. The full computation happens inside the index snapshot closure,
which holds its single connection mutex and serializes other index users.
The source proves the repeated work; its end-to-end cost was not measured here.

**Change:** copy the bounded immutable snapshot and revision under the lock, perform
graph computation outside it, and use bulk predecessor lookup plus ID sets.
Consider a bounded cache keyed by project and relevant revision only after measuring
the simpler refactor. Include archived/cancelled/off-snapshot predecessors when
preserving warning semantics. Do not reduce analysis to the visible page.
**Effort: medium.**

**Acceptance:** retain graph results and snapshot/cursor consistency; measure Gantt
alongside concurrent list/write requests on dense and sparse datasets.

### 7. P2 — A targeted projection refresh still scans the project's index rows

**Source:** `crates/application/src/index.rs:383–390`.

The predicate concatenates `entity_type || ':' || entity_id` and combines targeted
and full refresh in one optional predicate. EXPLAIN confirms that it uses only the
project prefix, rather than the existing full composite unique index. A 50,000-row
in-memory SQL probe returned one row in median 4.152 ms with the current expression
versus 0.001542 ms with a direct tuple lookup. This is a Python SQLite microprobe,
not a measured application write speedup or a promise about bundled SQLite.

**Change:** separate full-project and targeted SQL; use prepared lookups by
`(project_id, entity_type, entity_id)` or a bounded key table/join. Preserve all
missing, stale and deleted-target handling. **Effort: small.**

**Acceptance:** verify plans with the application's bundled SQLite and rerun
incremental projection tests, including create/delete/recreate and invalid sources.
[Query plans and measurements](checks/backend-probes.txt).

### 8. P2 — Card creation repeats source scans and dependency references

**Source:** `crates/application/src/mutation.rs:224–294, 304–336`;
`crates/application/src/writer.rs:104` (`references_match`).

Creating a card scans the card collection for ordering and again for graph
validation. Ordering references are then appended again by dependency validation,
and the writer rereads those references. Some revalidation is required because an
external editor is not controlled by the server's project mutex; the duplicate
preparation and duplicate reference entries are separable overhead.

**Change:** reuse one parsed preparation snapshot where semantics allow it;
deduplicate identical reference keys/versions before journaling. Reject differing
observed versions for the same key rather than silently selecting one. Retain
ordering/dependency preconditions, final reference-version checks and recovery checks.
**Effort: medium.**

**Acceptance:** run existing ordering, dependency, conflict and crash-recovery
tests; measure create/reorder/dependency edits on one large project, rather than
only a workspace containing many small projects.

### 9. P2 — Full projection refresh delays listener startup

**Source:** `crates/application/src/engine.rs:102–123`;
`crates/projectd/src/main.rs:34–58`.

Engine open serially recovers and fully refreshes each project before binding the
HTTP/Unix listeners. The current benchmark records 8.3 seconds for initialization
of its standard fixture. The source also shows that an existing index does not
avoid the full refresh; unchanged fully indexed reopen time remains unmeasured.

**Change:** separate mandatory recovery/readiness from background projection
reconciliation; serve explicitly stale existing projections for recovered projects,
with bounded workers and visible per-project readiness. Do not enable writes before
recovery completes. **Effort: large; schedule after the local optimizations.**

**Acceptance:** separately measure process-to-listener time, first useful UI data,
fully indexed restart and cold rebuild; test interrupted recovery and partial
project availability. This is a lifecycle change, not removal of required checks.

### 10. P2 — Static assets cannot benefit from browser caching

**Source:** `crates/projectd/src/lib.rs:115–127, 281–286`;
`crates/projectd/build.rs:1–46`.

The common security response wrapper sets `Cache-Control: no-store` for every
browser response, including content-hashed JS and CSS. The static handler returns
raw embedded bytes and has no content-encoding negotiation. Vite's reported gzip
size is therefore an estimate unless a downstream proxy supplies compression.

**Change:** keep sensitive API/auth data non-cacheable; give content-hashed assets
an appropriate immutable cache policy and HTML an update-aware policy. Add static
precompression/negotiation or explicitly configure and verify it in supported proxy
setups, including `Vary: Accept-Encoding`. Keep CSP and other security headers.
**Effort: small/medium.**

**Acceptance:** inspect cold/warm HTTP transfers, gzip/identity responses, HTML
refresh across builds, cached chunks and missing old lazy chunks. The appropriate
scope is static assets, not an indiscriminate cache policy for all responses.

### 11. P2 — Some regression tests are outside the normal verification path

**Source:** `.github/workflows/check.yml:32–40`; `scripts/check.py:11–22`;
`progress/stage2-2026-09-08/tag-browser-checks.mjs:8–15`;
`progress/stage2-2026-09-08/card-browser-checks.mjs:784–817`.

CI runs the two main browser scripts, but the newer card/tag/editor/dialog suites
remain under dated progress folders and are not invoked. Several depend on a
pre-existing `.manual/audit-2026-09-08/connection.json` and release binaries.
The eight Omarchy Python tests are also absent from `check.py`; they passed when
run explicitly during this audit. Green CI does not exercise all these scenarios.

**Change:** move maintained tests into a stable test directory, share an isolated
fixture that starts/stops its own normally authenticated host, and register the
important regressions in CI. Consolidate duplicated host/proxy/pairing setup in
`scripts/browser-smoke.mjs:34–133` and `scripts/planning-browser.mjs:52–159`.
Leave immutable historical evidence in `progress/`. **Effort: medium.**

**Acceptance:** run from a clean checkout without `.manual/`; fail CI on a selected
regression; clean up processes even after failure; preserve real pairing/auth tests.

### 12. P2 — Handwritten projections already diverge in Focus

**Source:** `apps/web/src/App.svelte:369–390`;
`apps/web/src/lib/api.ts:15–35`;
`apps/web/src/lib/ResourceMetadata.svelte:54–63`.

When a pinned card is absent from the first list page, the detail fallback constructs
its summary by spreading metadata and casting it. It sets `availability: "available"`
outside the contract enum and omits derived `acceptance_progress`. Thus the same
card can lose its acceptance badge depending on which fetch path resolved it.
The manually typed `availability: string` does not catch this mismatch.

**Change:** use one explicit detail-to-summary adapter, reuse the existing acceptance
helper, and narrow response enums. Extend existing generation to API projection
types where practical, rather than introducing a second hand-maintained model.
**Effort: small for the defect; medium for broader type generation.**

**Acceptance:** a pinned card has the same metadata badges when it is present in
the first page and when the detail fallback is used; invalid availability literals
are rejected by type checking.

### 13. P3 — Audit images dominate tracked repository size

**Evidence:** [Tracked-file inventory](checks/metrics.json).

The audited revision contains 618 tracked files totaling 33,069,237 bytes.
`progress/` contributes 31,135,388 bytes (94.2%). Its 210 tracked images account
for 30,303,329 bytes (91.6% of all tracked bytes). This affects checkout/history
growth, not the shipped frontend bundle. Separately, the ignored local `target/`
directory occupies about 6.9 GiB and is build cache, not versioned application code.

**Change:** retain short durable reports and machine-readable summaries in Git;
store future bulk screenshots/traces in durable artifact storage with a manifest,
checksums and a retention policy compatible with acceptance evidence. Consolidate
maintained regression scripts before archiving dated copies. **Effort: small/medium.**

Do not delete referenced acceptance evidence before replacing its references.
Deleting files in a new commit does not shrink existing Git history; history
rewriting is a separate owner decision. Generated schemas and `MASTER-SPEC.md`
are deliberate reproducible contract/document outputs, not unexplained dead code.

### 14. P2 — Long-lived SSE streams do not observe application shutdown

**Source:** `crates/projectd/src/main.rs:60–86`;
`crates/projectd/src/lib.rs:24–29, 327–345`.

The stop signal reaches the watcher and Axum graceful-shutdown futures, but the
Service/SSE loop has no receiver for it. The stream continues until a client
disconnects or a session/read error occurs. This is a static control-flow finding:
an open stream can keep graceful connection completion waiting, so normal service
stop/restart needs explicit stream cancellation. A runtime SIGTERM reproduction
was not completed in this audit.

**Change:** pass the shutdown signal into stream handling, select on it and stop
producing SSE events on shutdown. Define bounded draining while preserving in-flight
durable mutation/recovery guarantees. **Effort: small/medium.**

**Acceptance:** with an open local and authenticated browser stream, send SIGTERM
and verify orderly process exit, released writer locks/socket cleanup, and a
successful restart. Also verify a concurrent mutation retains its recovery contract.

The same loop wakes once per second per stream despite having index notifications
(`lib.rs:334–344`). This means up to 64 periodic blocking tasks with auth/index
reads at the configured stream cap, separate from the eight ordinary request slots.
Consider separating notification-driven event delivery from bounded session-liveness
checks after measuring idle-client costs. Preserve prompt session revocation and
passive authentication; do not simply remove the timer.

### 15. P2 — Request admission comes after body buffering and JSON parsing

**Source:** `crates/projectd/src/lib.rs:170–199`.

The handler first collects up to 1.1 MB of body and parses JSON on the async
runtime; only afterwards does it acquire one of the eight worker permits.
The dispatcher is bounded, but concurrent body collectors and parsing are outside
that bound. A per-body size limit is useful but does not bound aggregate work.
The relevant overload behavior was not load-tested in this audit.

**Change:** add admission before body collection and a body-read deadline; perform
substantial parsing in bounded blocking work. Preserve origin, peer, content-type,
body-size and authentication checks, and avoid consuming an ordinary worker permit
for the lifetime of an SSE connection. **Effort: medium.**

**Acceptance:** concurrent slow/near-limit requests keep memory and health/read
latency bounded, reject excess work explicitly, and retain normal API error codes.

### 16. P2 — CLI request tuples and duplicated decoding obscure transport semantics

**Source:** `crates/projectctl/src/typed.rs:8–15, 314–320`;
`crates/projectctl/src/main.rs:190–207, 373–437`.

A six-element tuple represents a request using several interchangeable String
and Option<String> fields. Retry identity generation and uncertain-result output
are duplicated. Preliminary hello/project-resolution calls use `error_for_status()`
and direct JSON decoding, whereas final submission has explicit bounded decoding
and structured application-error handling. Equivalent failures can therefore lose
different diagnostic information depending on the phase.

**Change:** replace the tuple with a named request struct and explicit read/mutation
semantics; centralize bounded response decoding, error mapping and identity
creation while preserving distinct maintenance and normal API payload contracts.
Keep the read-only POST tag preview classified as a read. **Effort: medium.**

**Acceptance:** exercise equivalent structured failures during hello, project
resolution, report lookup and final submission; preserve JSON output, exit codes,
and the original request ID/epoch on uncertain writes.

## Refactoring boundaries and implementation order

The 2,429-line `App.svelte` and 988-line editor are navigation markers, not defects
by themselves: both counts include markup and styles. Extract responsibilities
with concrete ownership instead of splitting files mechanically:

| Area | Proposed ownership | Why |
| --- | --- | --- |
| Application shell | Navigation, layout and modal routing | Remove query orchestration from the render root |
| View queries | Query keys, paging, cancellation and scoped invalidation | Fix unnecessary refreshes and stale work |
| Editor draft | Typed resource draft and patch creation | Separate field mapping from transport and UI |
| Mutation lifecycle | Shared transport/result classification | Keep stable request ID, epoch and payload across dialogs |
| Resource presentation | Explicit summary mapping and enums | Eliminate divergent list/detail/focus rendering |
| Browser fixtures | Temporary host, proxy, pairing and cleanup | Make regressions portable and reduce duplicated scripts |
| CLI transport | Named requests, bounded decoding and error mapping | Preserve command semantics across preliminary/final calls |

Extract a shared mutation state machine incrementally, starting with the analogous
date/move dialogs (`DateChange.svelte:69–130`, `MoveChange.svelte:70–125`). Keep
domain-specific completion callbacks explicit; editor resource saves, read receipts
and Focus saves deliberately have different effects. Preserve tests for 202/pending,
conflicts, lost responses, session loss and retry identity before expanding reuse.

Suggested review-sized sequence:

1. Register portable regression coverage; fix projection diagnostic collisions and
   the Focus summary adapter with focused regression cases; reproduce and address
   SSE shutdown with an isolated process test.
2. Replace Gantt array scans and targeted-index SQL; compare outputs and release
   measurements before/after each change.
3. Add paginated card-history filtering through the complete contract pipeline.
4. Remove editor collection scans; share tag suggestions without weakening fresh
   management-preview semantics.
5. Extract view query/invalidation ownership and consolidate mutation lifecycle
   behavior through the existing draft/conflict regression suite.
6. Address backend Gantt lock duration, redundant mutation preparation, admission
   before parsing, CLI transport duplication and static asset delivery; then tackle
   startup lifecycle if measurements justify it.
7. Establish artifact retention and migrate maintained tests out of dated folders.

Small follow-up: `App.svelte:48–52` does not catch failure of the `DateViews` lazy
import, unlike other planning loaders. Provide an error/retry state instead of an
indefinite loading message and verify an interrupted or obsolete chunk request.

The next benchmark extension should cover a single large project, dense Gantt,
tag autocomplete, card activity, rapid navigation/SSE, concurrent readers/writes,
and an unchanged fully indexed restart. Record request counts and lock occupancy
alongside p50/p95/p99. The current healthy generic workload does not validate those
paths, and the isolated probes do not replace release/browser measurements.

Keep the shared Rust domain, `.project` source-of-truth model, generated contracts,
durable journal, fsync, version checks, authentication, bounded reads and lazy
planning chunks. There was no evidence here that removing a product feature,
changing framework, adding a state-management dependency or weakening these
guarantees would improve the result.

## Reproduce the bounded probes

Run from the repository root after the ordinary dependencies/build prerequisites:

```sh
node progress/code-health-2026-09-08/checks/frontend-bounded-probes.mjs
python3 progress/code-health-2026-09-08/checks/backend-probes.py
scripts/cargo-local run --release --locked -p project-application --example benchmark -- 100 100 500
```

The backend probe uses in-memory SQLite and temporary synthetic files, links the
newest existing debug application library, and does not rebuild application sources.
Its compiler/temp-directory discovery currently targets this macOS workspace.
Both reproduction programs assert the current observed behavior; they are audit
evidence to convert into proper product regression tests, not permanent green
tests that should preserve the defects after fixes.
