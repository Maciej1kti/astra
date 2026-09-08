# Repository optimization and code health follow-up — 2026-09-08

Audited revision: `a71b282c8b95cdb6185943ab9a8edb27f3097128`.

The next investment should be correctness at API boundaries, source-read costs in
large projects, and clearer ownership of frontend state. The current Rust/Svelte
architecture is a useful base. Runtime dependency removal or a framework rewrite
has no supporting evidence in this review.

This is an analysis deliverable. Product sources, dependencies, contracts, user
data, acceptance statuses and Git history were not changed. New material is
limited to this report and its small evidence/reproduction files. The checkout
started clean and contains no root `.project/`; none was initialized.

The [previous audit](../code-health-2026-09-08/README.md) and its
[implementation](../code-health-implementation-2026-09-08/README.md) were checked
against current source. Bounded card history, relation hydration, shared GETs,
linear frontend Gantt edge preparation, targeted projection SQL, recovery-first
startup, gzip delivery and portable browser regressions are already implemented.
They should not be proposed again as missing work.

## Verification and measurements

Environment: macOS arm64, Apple M4, 16 GiB RAM, Node 24.11.0, pinned Rust 1.92.0;
local release builds and temporary synthetic datasets. See
[environment, file and bundle metrics](checks/metrics.json).

| Check | Current result |
| --- | --- |
| Integrated local check | Pass: contracts, examples/package validation and OpenAPI |
| Rust | 112 tests passed; formatting and Clippy with warnings denied passed |
| JavaScript / Python | 47 JavaScript tests and 12 Python tests passed |
| Svelte / TypeScript | 0 errors, 0 warnings |
| Production builds | Frontend and Rust workspace release passed |
| Release browser regressions | `code-health` and `planning` passed |
| Additional analysis probes | Confirmed the pagination, search and command-status findings below |

[Integrated output](checks/full-check.txt),
[browser output](checks/browser-regressions.txt),
[backend probes](checks/backend-probes.json),
[frontend probes](checks/frontend-probes.json),
[real daemon contract probe](checks/transport-probes.json).

The browser run used normal pairing on temporary HTTPS hosts and included desktop
and phone-sized Chromium views. Other browser suites, physical iPhone/Safari,
Omarchy, VPN latency, dense concurrent Gantt and steady-state RSS were not measured
in this follow-up. Passing existing checks does not cover the reproduced failures.

| Release measurement | Result | Interpretation |
| --- | ---: | --- |
| Standard workload, 100 projects / 10,000 cards / 50,000 reports: write / query / attention p95 | 71.99 / 20.92 / 30.45 ms | Within the current 150 ms write and 50 ms query targets |
| One project, 1,000 cards and 500 reports: write p50 / p95 / p99 | 28.77 / 479.39 / 491.10 ms | Large-project write tail exceeds the 150 ms target |
| Same workload: query / attention p95 | 1.67 / 1.03 ms | Indexed reads are inexpensive in this profile |
| Tag catalog, 1,001 cards across two projects | 213.01 ms median | Source scanning remains expensive for suggestions |
| Same exploratory fixture: list / board / Gantt median | 0.89 / 4.86 / 3.55 ms | Sparse graph/read probes; no concurrent-load claim |
| Initial JavaScript + CSS, gzip estimate | 120,433 bytes, about 118 KiB | Below the 300 KiB startup budget |
| Tracked repository content | 33,395,067 bytes | `progress/` accounts for 93.42% |

The [single-project benchmark](checks/benchmark-single-project.json) has 20 warmups
and 200 measured samples per operation, with the existing mutation mix: one create
per five iterations, otherwise a title edit. It does not establish that every edit
takes 479 ms. The tag/planning probes have one warmup and ten measured samples;
their medians are exploratory and are not acceptance p95 measurements. Application
timings exclude transport and browser rendering. No durability checks were disabled.

The [standard benchmark](checks/benchmark-standard.json) uses the same warmup and
sample counts. An [earlier standard run](checks/benchmark-standard-shared-load.json)
overlapped the small browser/transport checks near its end and is retained as
shared-load evidence only. The reported standard numbers are from the separate
rerun after those checks finished. Startup mode values have one sample each and
are not startup p95 measurements. The report's links and package consistency also
[passed validation](checks/report-validation.txt).

## Prioritized findings

P1 means a functional or command-identity defect to address before broad
refactoring. P2 means a concrete performance or maintainability opportunity. P3
means hygiene or a lower-impact improvement. Effort estimates describe scope:
small is local, medium spans several modules, and large changes an important lifecycle.

### 1. P1 — Planning pagination does not recognize the backend's stale-page error

**Evidence:** [views.rs](../../crates/application/src/views.rs), lines 11 and 174;
[pagination.ts](../../apps/web/src/lib/pagination.ts), line 7;
[GanttView.svelte](../../apps/web/src/lib/GanttView.svelte), line 250.

Attention, calendar, board and Gantt return `PAGE_STALE`. The shared `cursorPage`
helper only recovers from `CURSOR_STALE`, and Gantt has a separate check for that
same wrong code. Board and calendar use the shared helper; so does Attention.
The intended first-page restart and notice are never reached for these responses.

The backend probe fetched cursors for project A, changed a card in project B,
then received `PAGE_STALE` for A's Attention, board and Gantt. The frontend probe
confirms that `PAGE_STALE` triggers one failed request with no recovery, whereas
`CURSOR_STALE` fetches the first page. This can leave a paged planning view showing
an error or old rows after an ordinary background change.

**Change:** centralize stale-page classification, initially supporting both existing
codes, and use it in every paginated consumer. Keep the explicit reset notice and
gesture/draft protections. Unifying the public error vocabulary later requires the
contract pipeline, not merely changing one string in the UI. **Effort: small.**

**Acceptance:** reach page two, mutate a source, then refresh or move to the next
page in Attention, board, calendar and Gantt. Each must recover visibly; 401,
timeout and unrelated 409 responses must retain their distinct behavior. Add a
real transport/browser regression rather than another mock with an invented code.

### 2. P1 — Command status ignores the epoch required by its contract

**Evidence:** [OpenAPI](../../contracts/openapi.yaml), line 1579;
[dispatch.rs](../../crates/projectd/src/dispatch.rs), line 389;
[Editor.svelte](../../apps/web/src/lib/Editor.svelte), line 515;
[typed.rs](../../crates/projectctl/src/typed.rs), line 284.

The status endpoint declares a required UUID `epoch` query parameter, but the
handler never reads it and always searches the current journal epoch. UI and CLI
status callers omit it. A real release daemon returned `committed` for the same
command with the correct epoch, a different UUID, malformed text, and no epoch.

This breaks the original `(request ID, epoch)` status identity described by the
protocol. After state replacement, a missing command must not become proof that
an earlier write failed. The probe demonstrates contract drift; it does not claim
a reproduced cross-epoch data loss. Mutation admission still checks command epochs.

**Change:** make a single `commandStatus(pending)` operation carry the original
epoch, validate it on the server and return an explicit documented outcome when
the epoch is unavailable or changed. Update CLI arguments, all dialog callers,
OpenAPI/examples and transport tests together. **Effort: medium.**

**Acceptance:** missing/malformed/different epochs have the documented response;
current-epoch status works; uncertain writes followed by state replacement cannot
be classified as safe new commands solely from `COMMAND_NOT_FOUND`.

### 3. P2 — Relation search can hide valid matches behind unrelated resource types

**Evidence:** [Editor.svelte](../../apps/web/src/lib/Editor.svelte), line 119;
[dispatch.rs](../../crates/projectd/src/dispatch.rs), lines 64 and 341.

The editor searches all resource types with `limit=50`, then filters the returned
page by `choiceKind`. With 60 matching reports and 1,000 matching cards, the actual
query returns 50 reports and the client shows zero cards. A server-filtered query
on the same fixture returns 50 cards. The editor does not expose continuation for
this mixed search.

**Change:** use the existing `/api/v1/views/list` endpoint with `type`, `q`,
`project_id` and a bounded limit. Do not simply add `type` to `/api/v1/search`:
that endpoint currently rejects it. Add request cancellation/generation ownership
to prevent an older search replacing newer choices. **Effort: small.**

**Acceptance:** mixed collections with more than 50 unrelated matches still show
the requested type; rapidly repeated searches retain the newest result.

### 4. P2 — Creation, ordering and dependency edits scale with the source collection

**Evidence:** [mutation.rs](../../crates/application/src/mutation.rs), lines 224,
234, 299 and 313; [engine.rs](../../crates/application/src/engine.rs), line 506;
[writer.rs](../../crates/application/src/writer.rs), lines 94 and 275.

Creating a card, changing its ordering/status, or validating dependencies reads
and parses sibling source documents. The writer then reads distinct referenced
files again to verify versions. Collection reuse and reference deduplication are
already present, but total work still grows with project size while holding the
project lock. The repeated single-project benchmark reproduces the earlier
approximately 478 ms write p95 at approximately 479 ms.

**Change:** first separate create, title edit, status/placement, dependency and
conflict timings, including time waiting for the project lock. Reject an already
known target-version conflict before expensive preparation while preserving its
recorded idempotent outcome. Then consider parsed-source reuse keyed by content
hash and a deliberately specified collection/graph guard for ordering and graph
validation. Preserve checks for externally added/deleted files and retain final
reference validation and fsync. An index-only fast path would weaken source authority.
**Effort: medium for instrumentation/early rejection; large for source-observation reuse.**

**Acceptance:** release measurements by operation at 100/1,000/10,000 cards;
external edits, insertion/deletion, dependency cycles and conflicting references
still fail safely. No benefit should be claimed from skipping required durability.

### 5. P2 — Tag suggestions still pay for a fresh workspace-wide management scan

**Evidence:** [tags.rs](../../crates/application/src/tags.rs), lines 66 and 176;
[tag-suggestions.ts](../../apps/web/src/lib/tag-suggestions.ts), line 50;
[view-queries.ts](../../apps/web/src/lib/view-queries.ts), line 50;
[TagPicker.svelte](../../apps/web/src/lib/TagPicker.svelte), line 42.

The browser cache already deduplicates requests and has a 30-second TTL. However,
any card/project change invalidates it, including changes from other projects.
An open picker reloads immediately; otherwise a later focus/open does so. Cache
misses still invoke the full catalog endpoint, which reads source cards under
their project locks. The measured median is 213 ms for 1,001 cards.

**Change:** make invalidation sensitive to actual tag changes where the event
contract can support it. For a larger gain, introduce a bounded suggestion
projection with explicit freshness and cheap lookup; keep management catalog and
rename previews on their fresh source checks. This separation must respect
[ADR-028](../../docs/ADR-028-WORKSPACE-TAGS.md), which deliberately bypasses the index
for management observations. **Effort: medium.**

**Acceptance:** repeated non-tag edits do not repeatedly scan the entire workspace
for autocomplete; tag edits refresh suggestions; a fresh rename preview still
finds an unindexed external label with its original source version.

### 6. P2 — Unrelated writes invalidate every project's pagination snapshot

**Evidence:** [index.rs](../../crates/application/src/index.rs), lines 269 and 703;
[views.rs](../../crates/application/src/views.rs), lines 71, 142 and 172.

List and planning cursors include the global index sequence. The probe confirms
that editing only project B invalidates project A's list, Attention, board and
Gantt cursors. Scoped SSE invalidation avoids an immediate refetch, but the next
page read still fails. Fixing finding 1 makes the fallback work; users would still
lose their position because of unrelated activity.

**Change:** investigate per-project or per-collection projection revisions for
scoped queries, with explicit invalidation for workspace/timezone/freshness changes.
Keep global revision behavior where the query really spans the workspace. Do not
merely stop checking the cursor or reuse an offset across changed ordering.
This is a cursor/contract design change. **Effort: medium/large.**

**Acceptance:** writes in B preserve A's valid pages; relevant writes in A still
invalidate the correct snapshot, with no duplicate or skipped results.

### 7. P2 — Frontend responsibilities remain concentrated in the shell and editor

**Evidence:** [App.svelte](../../apps/web/src/App.svelte), especially `refresh`,
session handling, registration and route restoration;
[Editor.svelte](../../apps/web/src/lib/Editor.svelte), especially `save`.

`App.svelte` has 2,407 lines, including 834 script and 929 style lines. The editor
has 1,010 lines, including 546 script lines. File size alone is not a defect:
the concern is that session, route, query, modal and registration state share many
mutable flags and generations, while the editor maps four resource types into
one generic patch builder.

**Change:** extract ownership incrementally, with explicit inputs and cleanup:

| Module/component | Owned responsibility |
| --- | --- |
| Session controller | Bootstrap, pairing lifecycle, session-ended/restored events |
| View query controller | Active query, cancellation, pagination, SSE invalidation |
| Registration dialog | Roots, browsing, plan, pending command and job status |
| Typed editor drafts | Per-resource initialization, validation and pure patch builders |
| Shell and view components | Layout/navigation and each view's rendering |

Avoid moving every variable into a generic global store. Keep the current
conflict, pending-command and unsaved-draft behavior as acceptance constraints.
**Effort: medium, split across small reviewed changes.**

### 8. P2 — Transport types and command invariants need one maintained boundary

**Evidence:** [generate-contracts.mjs](../../scripts/generate-contracts.mjs), line 5;
[api.ts](../../apps/web/src/lib/api.ts), lines 13, 54, 169 and 188;
[DateChange.svelte](../../apps/web/src/lib/DateChange.svelte), line 74;
[MoveChange.svelte](../../apps/web/src/lib/MoveChange.svelte), line 70.

Generated types cover the domain schema. API summaries, pagination, bootstrap,
command responses and error handling are largely handwritten and widened to strings
or generic records. Similar dialogs duplicate pending/result/status classification.
Findings 1 and 2 show that schema validity and passing type checks do not ensure
agreement between the running server and client.

The analysis probe also shows that `command()` retains the caller's payload by
reference: mutating a nested input after a lost response changes the retry body
while preserving the request ID. Existing UI controls prevent many such edits;
this is a missing helper-level invariant, not a demonstrated user-facing loss.

**Change:** generate or explicitly maintain transport DTOs and a shared error
vocabulary alongside their server contract tests. Capture an immutable serialized
payload or owned immutable snapshot when a command is created. Centralize status
lookup and outcome classification, while leaving resource/focus/read-receipt
completion callbacks specific to their operation. **Effort: medium.**

**Acceptance:** original request ID, epoch, precondition and body survive nested
input changes, uncertain replies and session recovery; documented error codes are
tested against real responses. Typed draft changes must preserve unknown `x-*`
extensions and the distinction between clearing and omitting a field.

### 9. P3 — Repository bloat is mostly historical evidence, not runtime dependencies

**Evidence:** [tracked-file metrics](checks/metrics.json),
[existing artifact policy](../../scripts/browser/README.md).

`progress/` contains 31,198,701 of 33,395,067 tracked bytes: 93.42%, with 210 tracked
binary artifacts across the repository. The initial JS/CSS estimate is about
118 KiB gzip. Gantt is a separate approximately 101 KiB gzip JS/CSS chunk. All five
direct frontend runtime dependencies have source consumers. There is no identified
unused runtime dependency to remove indiscriminately.

**Change:** apply the existing artifact-retention policy to old evidence when its
acceptance references can be replaced with durable links and checksums. Keep short
reproduction instructions and result summaries in Git; retain ordinary generated
screenshots in ignored/CI output. Consolidate obsolete handoff prose only after
its outstanding requirements are accounted for. `MASTER-SPEC.md` and generated
contracts are intentional derived artifacts, not independent documents to hand-edit.
**Effort: small/medium.**

Deleting files in a new commit reduces the current tree, not the historical clone
size. Rewriting Git history is a separate action and was not performed. Removing
calendar/Gantt/Kanban would remove product features and is not justified by this audit.

### 10. P3 — Quality checks need behavioral boundaries and a reproducible style policy

**Evidence:** [check.py](../../scripts/check.py), [CI](../../.github/workflows/check.yml),
[view query tests](../../scripts/tests/view-queries.test.mjs),
[format probe](checks/frontend-format-check.txt).

The maintained gates are substantial and pass. Their blind spot is coverage of
real protocol boundaries: mocked stale-cursor tests exercise only the code the
client already expects. Performance budgets are documented and benchmarks exist,
but the CI workflow does not run a budget check. Frontend formatting is not a gate;
the installed Prettier's default TypeScript check reports 12 files, one generated.
That check did not cover Svelte without explicit plugin configuration.

**Change:** first add the concrete cross-boundary regressions from findings 1–3.
Configure the existing formatter and Svelte plugin, formatting generated files
inside their generator or excluding them by policy. Add a deterministic gzip-size
gate. Run release performance profiles on a controlled host with artifacts and
explicit tolerance, rather than rejecting shared CI runners on noisy millisecond
thresholds. **Effort: small/medium.**

## Suggested implementation order

1. Add failing regressions and repair the stale-page classifier, command-status
   epoch handling and server-filtered relation search.
2. Make the command snapshot/status helper own its invariants; bring transport
   response/error types under the same contract workflow.
3. Measure and reduce large-project source preparation and suggestion scans,
   retaining source authority and durability throughout.
4. Extract shell/editor responsibilities around those tested boundaries; consider
   scoped cursor revisions as a separately reviewed protocol change.
5. Apply frontend formatting and artifact cleanup policies, then add bundle and
   controlled performance regression gates.

Smaller follow-ups, after measurement: `Engine::list` reads report receipts one
row at a time through the journal mutex; one bounded batch could simplify this.
Calendar/Attention still perform query/materialization under the shared index
snapshot lock; instrument contention before adding connection pools or caches.
Additional lazy loading of editor/settings is optional because startup bytes are
already comfortably within budget.

Keep the shared Rust domain, `.project` source authority, generated contracts,
authenticated server-only writes, bounded admission, version checks, durable
journal/fsync and explicit recovery. These enforce product guarantees and are
not code bloat.

## Reproduction

Run from the repository root with the documented installed toolchains/dependencies:

```sh
.venv-check/bin/python scripts/check.py
node progress/code-health-follow-up-2026-09-08/checks/frontend-probes.mjs
python3 progress/code-health-follow-up-2026-09-08/checks/run-backend-probes.py
ASTRA_TEST_PROFILE=release node progress/code-health-follow-up-2026-09-08/checks/transport-probes.mjs
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs code-health planning
target/release/examples/benchmark 1 1000 500
target/release/examples/benchmark 100 100 500
```

Run performance profiles separately from browser tests and other builds. The
backend runner builds the existing release benchmark to resolve matching library
artifacts, compiles only the analysis probe in a temporary directory, and removes
its synthetic state on exit. The frontend/transport probes assert current observed
defects; convert them to desired-behavior product regressions before implementing
fixes. They are evidence, not permanent tests that should preserve the defects.
