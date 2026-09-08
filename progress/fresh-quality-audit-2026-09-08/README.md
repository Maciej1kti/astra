# Fresh code quality and architecture audit

Date: 2026-09-08. Scope: the complete current working tree, including local source
files, rather than the latest diff. Previous audit findings were not used as the
basis for this assessment. No application source was changed, committed or pushed.

Follow-up: Q01 was addressed by the later
[CLI improvements](../cli-improvements-2026-09-08/README.md), with failing-before
regressions and full local verification. The findings below retain the audited
snapshot. The later [important audit fixes](../audit-fixes-2026-09-08/README.md)
address Q02–Q07 and the bounded timeline/runtime parts of Q08/Q09, with their
verification and remaining limits recorded separately. Q10 remains open.

## Assessment

**Approximately 7/10 for maintainability: a sound architecture with several
unfinished ownership boundaries. A complete rewrite is not justified.** This is
an engineering judgment, not a computed quality score. On this scale, 5 means
routine changes require substantial cross-module knowledge, 7 means useful
boundaries exist but some responsibilities still leak, and 9 means ordinary
changes remain local and important invariants are both explicit and verified.

The strongest parts are source validation, explicit durable writes and recovery,
shared application rules, command identity handling in the browser, and behavioral
tests. The main opportunity is to reduce the number of places that independently
encode the same rule. Formatting alone will not achieve that.

| Area | Assessment | Reason |
| --- | --- | --- |
| Overall architecture | Strong foundation | Real domain/store/application/transport boundaries; one server-side write authority |
| Local readability | Good, uneven | Formatting is automated; some components, macros and JSON constructions still combine many decisions |
| Encapsulation and internal types | Needs focused work | Mutable navigation internals, operational data in presentation JSON, incomplete typed endpoint ownership |
| Verification | Strong existing baseline | Behavioral tests, failure injection, contract checks and cross-platform CI recipe |
| Contributor experience | Usable, unfinished | Contribution guide exists; critical normative material still spans English and Polish documents |

No critical production data-loss defect was established by this audit. One CLI
response-validation defect was reproduced against a synthetic Unix HTTP server.
Other behavioral findings below are identified by source tracing and explicitly
distinguished from end-to-end reproductions.

## Size and the rewrite question

Physical lines, including whitespace and comments:

| Area | Files | Lines | Counting scope |
| --- | ---: | ---: | --- |
| Rust | 74 | 18,290 | `.rs`, including tests, build script and example |
| Frontend | 82 | 13,801 | Handwritten `.ts`, `.svelte`, `.css`; generated contracts excluded |
| Scripts | 49 | 9,272 | `.py` and `.mjs`, much of it test infrastructure |

These are not 41,000 lines of product logic. They are not inherently excessive
for a daemon, CLI, browser application, durable storage protocol and verification
tooling. Generated schemas, lockfiles, documentation and test code must not be
treated as equivalent maintenance burden.

Examples of concentration are `App.svelte` at 887 lines, of which 456 are inside
its script, and `browser-smoke.mjs` at 1,460 lines. The concern is the number of
responsibilities in them, not crossing an arbitrary line limit. Calendar and
Gantt components also contain substantial presentation and vendor styling.

| Strategy | Recommendation |
| --- | --- |
| Rewrite the entire product | No: the main architectural direction is sound, and the rewrite would have to preserve operational state compatibility and rediscover crash/retry edge cases |
| Replace a bounded implementation behind an existing contract | Yes where useful: CLI response classification, timeline input adapter, screen composition, test harness wrappers |
| Incrementally consolidate sensitive infrastructure | Preferred for command journal and workflow plans: preserve transaction ownership, saved JSON spellings and recovery behavior |
| Change framework or storage technology | No evidence from this audit justifies it |

Retain the filesystem adapter, writer protocol, validated source models, source
formats, generated contracts, `CommandController`, `ViewData`, `PlanningRead` and
durability/replay tests. Measure improvement by fewer independent rule owners,
fewer modules touched for a feature and clearer contracts. A good refactor can
add lines while reducing maintenance work.

## Scale

Importance: **5** = immediate critical correction; **4** = address before broader
feature expansion; **3** = planned maintainability work; **2** = local cleanup or
contributor friction; **1** = cosmetic preference. No item is rated 5.

Risk if left describes the consequence under the stated trigger, not a measured
probability. Refactor risk describes how easily a poorly scoped change could
regress existing behavior. Effort: S = one local seam; M = several related modules;
L = sensitive cross-module change with substantial verification. These are
relative scopes, not time estimates.

| ID | Finding | Importance | Risk if left | Refactor risk | Effort |
| --- | --- | ---: | --- | --- | --- |
| Q01 | CLI accepts structurally invalid successful command replies | 4 | High when a response violates the protocol | Medium | M |
| Q02 | Submit and status-check paths present conflicts differently | 4 | Medium: misleading retry/conflict UI | Medium | S–M |
| Q03 | Command-record lifecycle has multiple SQL owners | 4 | High impact if future implementations drift | High | L |
| Q04 | Workflow presentation JSON contains recovery inputs | 4 | High impact if saved-plan compatibility is broken | Medium–high | M |
| Q05 | Important operational error causes are discarded | 3 | High support/debugging cost during failures | Low–medium | M |
| Q06 | Projection failure handling differs after durable completion | 3 | Medium: completed work can produce an endpoint failure | Medium | M |
| Q07 | Application shell owns screens and navigation internals | 3 | Medium: increasing coupling and edit surface | Medium | M |
| Q08 | Known internal contracts fall back to arbitrary JSON/HTTP | 3 | Medium: compiler misses mismatched fields and operations | Low–medium | M |
| Q09 | Browser tests duplicate execution infrastructure | 3 | Medium: divergent fixtures and difficult failure isolation | Medium | M |
| Q10 | Vendor DOM and gesture assumptions are spread across UI | 3 | Medium, mainly on widget upgrades or multiple instances | Medium–high | M |

## Findings and concrete changes

### Q01 — Validate CLI operation results, not just HTTP success

Evidence: [transport response handling](../../crates/projectctl/src/transport.rs#L100)
at lines 100–116 and 135–153, and [exit classification](../../crates/projectctl/src/main.rs#L298).
Successful JSON is accepted without validating the expected operation result.
The response's `request_id` also takes precedence over the identity that was sent.

An isolated probe of the freshly built release CLI produced:

| Mock response to PATCH | Actual CLI result |
| --- | --- |
| HTTP 200 with `{}` | Exit 0, `ok: true`, `data: {}` |
| HTTP 200 with `null` | Exit 0, `ok: true`, `data: null` |
| HTTP 200 with a command-like envelope containing another request ID | Exit 0; outer output adopts the other ID |

This establishes a client-side defect for invalid/incompatible replies. It does
not establish that the current daemon emits them. An automation could otherwise
treat an unproven write as successful or follow up using the wrong command ID.

Use an explicit expected-result kind and validate it before reporting success.
For an invalid durable-command reply, retain the submitted identity and uncertainty.
Do not simply require `CommandResponse` on every current `Operation::Command`:
[Request::api](../../crates/projectctl/src/transport.rs#L45) infers semantics from
HTTP method plus a single preview exception. Session revocation, for example,
uses this path but is not a journaled durable command. Distinguish queries,
session actions, durable commands and workflows explicitly.

Verification: regression cases for invalid 2xx shapes, mismatched identity,
accepted jobs, valid commands and non-journaled actions. Existing CLI tests cover
invalid JSON and unsuccessful envelopes but miss the demonstrated successful JSON
cases. The browser's `normalizeCommandReply` is a useful behavioral reference;
it should not become a cross-language shared implementation framework.

### Q02 — Handle one command outcome the same way after send and status lookup

Evidence: [Editor](../../apps/web/src/features/editor/Editor.svelte#L336), lines
336–368; [DateChange](../../apps/web/src/features/planning/DateChange.svelte#L68),
lines 68–113; [MoveChange](../../apps/web/src/features/board/MoveChange.svelte#L68),
lines 68–104; [controller rejection](../../apps/web/src/lib/api/command-controller.ts#L99).

Direct submission handles version conflicts by refreshing focus or fetching the
current resource and setting conflict state. A rejected status lookup only sets
an error message in these dialogs. The shared controller correctly recognizes a
definitive rejection and clears the pending command, but the feature does not
perform the same transition as for a direct rejection.

Source tracing therefore shows different UI behavior for “reply lost, then status
says version conflict.” A proposal may allow another command with the old version
without its normal conflict presentation. Server version checks still prevent
overwrite; no data loss is established. This path was not browser-reproduced in
this audit.

Give each feature one completion/rejection handler used by both send and check.
Retain the existing controller. Extract a shared dialog mechanism only after the
feature-specific transitions are clear. Start with a lost-reply/rejected-status
regression and verify draft preservation, conflict presentation and retry identity.

### Q03 — Give command-record rules one owner without hiding transactions

Evidence: command insertion/finalization in [Journal](../../crates/application/src/journal.rs#L395),
[workspace writes](../../crates/application/src/workspace.rs#L190),
[receipts](../../crates/application/src/receipts.rs#L104) and
[workflows](../../crates/application/src/workflow.rs#L230).

Several modules independently encode the `commands` table layout, state,
digest, acceptance time and result-retention rules. Distinct file, workspace,
receipt and workflow protocols are reasonable; duplicated command-record rules
make future changes depend on remembering every owner.

Introduce small Journal operations that accept the caller's existing transaction,
typed state and record data. Keep the transaction and prepare/write/commit order
visible in each use case. Do not introduce a universal transaction framework or
move locks casually to shorten callers.

Verification: unchanged replay, rejection, no-op, retention and crash recovery for
every command family. This has the highest refactor risk in the proposed work and
should follow the smaller fixes, not be mixed with a broad directory reshuffle.

### Q04 — Separate operational workflow inputs from preview presentation

Evidence: [Plan](../../crates/application/src/workflow.rs#L87) stores `view: Value`
and `approved_root: Option<Value>`. Execution opens stores using
`plan.view["display_path"]` in [startup recovery](../../crates/application/src/engine.rs#L122),
[registration](../../crates/application/src/registration.rs#L238) and
[maintenance](../../crates/application/src/maintenance.rs#L301).
Maintenance also reads `previous_path` from that view when releasing a store.

The name and type suggest freely changeable presentation, but these fields are
required to execute and recover a saved operation. A preview edit can therefore
become an operational compatibility change without compiler feedback.

Define a typed saved-plan/approval model and an explicit presentation conversion.
The first step can preserve the exact existing serialized shape while making
required fields visible in Rust. Verify old saved-plan fixtures and restart
recovery; do not introduce speculative source migration infrastructure.

### Q05 — Preserve safe diagnostic context when continuing after errors

Evidence: [writer failure paths](../../crates/application/src/writer.rs#L193),
including lines 212 and 267; [startup recovery](../../crates/application/src/engine.rs#L116);
[workspace completion](../../crates/application/src/workspace.rs#L268);
[watcher tasks](../../crates/projectd/src/watcher.rs#L80) and lines 217–225.
[Diagnostics](../../crates/application/src/diagnostics.rs#L32) reports pending
counts and general guidance but does not recover those discarded causes.

Continuing with blocked/uncertain state is often the correct safety behavior.
The problem is losing whether the underlying failure was storage, permissions,
synchronization, SQLite or a worker panic. That increases the cost of maintaining
installations the maintainer cannot access directly.

Record bounded diagnostic events with operation stage, project/request/job ID and
a safe error category. Separate worker failure from application failure. Avoid
logging full document values, credentials or unrestricted parser error payloads.
The first step should add observability without changing public response or
recovery semantics. Test the recorded category with controlled failures.

### Q06 — Make post-completion projection policy consistent

Evidence: [ordinary mutation](../../crates/application/src/mutation.rs#L106)
retains committed success and adds a projection warning. In contrast,
[maintenance](../../crates/application/src/maintenance.rs#L335) confirms the job
is done, then uses `?` on index forget/refresh/invalidation at lines 343–347.

An index failure in this latter path can turn a durably completed operation into
an endpoint error. This is source-confirmed control flow; the failure was not
injected during this audit. The durable record still supports status/replay.

Apply an explicit post-completion policy: preserve the completed result, record
projection degradation, and arrange reconciliation. Keep index rebuilding that
is itself the requested job's work distinct from an incidental projection update
after another job completes. Start with a failure injection after maintenance
completion, checking response, job state, replay and store lifecycle cleanup.

### Q07 — Make App composition-only and close navigation ownership

Evidence: [App selectors](../../apps/web/src/App.svelte#L262), attention grouping
at line 312, resource loading/generation checks at line 351, and complete screen
markup from line 564. [Navigation state](../../apps/web/src/features/workspace/navigation-state.svelte.ts#L94)
exposes mutable `current` and a generation setter; App changes both directly.

Adding a screen currently involves the shell, route synchronization, request
generation and the markup/selectors of several existing screens. Moving the
state into a separate file has not fully encapsulated its rules.

Extract actual screen owners such as focus, project overview, resource list and
updates, together with their selectors. Introduce navigation actions that own
generation changes, such as selecting a project/view or opening a resource.
Keep App's explicit composition callbacks. Do not replace it with one global
service containing the same combined responsibilities.

Verification: browser back/forward, stale resource reads, draft guards, filters
and pagination. No line-count target and no requirement to split every large
Svelte component.

### Q08 — Use typed boundaries where the shape is already known

Two concrete seams justify this recommendation:

- The frontend has generated types and named endpoints, but
  [Editor](../../apps/web/src/features/editor/Editor.svelte#L276) constructs its
  own resource path, and [DateChange](../../apps/web/src/features/planning/DateChange.svelte#L93)
  constructs a raw PATCH despite the existing typed `patchCard` endpoint.
  Several settings, registration and view reads similarly choose their own
  response shape and raw URL.
- [Gantt rendering](../../crates/application/src/views/gantt.rs#L130) converts
  known fields to JSON and passes the magic `x-analysis-invalid` key into
  [domain timeline analysis](../../crates/domain/src/timeline.rs#L33). The
  algorithm reparses keys and silently filters missing IDs/non-string
  dependencies. Adapter mistakes can resemble absent data.

Complete small named endpoint modules using generated contracts. Give the pure
timeline algorithm a `TimelineInput` containing ID, schedule, dependencies and
explicit validity, with SQLite/JSON conversion in application code. This makes
field changes compiler-visible and simplifies reading the algorithm.

Do not remove JSON from extension fields, patch envelopes or genuinely variable
projections. Do not wrap every string in a newtype. Add type-level endpoint cases
and preserve behavioral timeline tests for incomplete data, stale projections,
cycles and date boundaries.

### Q09 — Consolidate browser test infrastructure and separate scenarios

Evidence: [card suite startup](../../scripts/browser/suites/card.mjs#L787) and
[editor suite startup](../../scripts/browser/suites/editor.mjs#L921) duplicate
CLI execution, config loading, browser startup, pairing and output handling.
The [tag suite](../../scripts/browser/suites/tags.mjs#L21) has another client;
the shared [host client](../../scripts/browser/host.mjs#L24) already provides
timeouts and envelope handling that these copies do not consistently use.
Suites also repeat custom `check()`/screenshot/result-writing wrappers.

The 1,460-line [smoke script](../../scripts/browser-smoke.mjs#L49) is a long
sequential flow with shared state. A failure can prevent unrelated later
scenarios from running. The regressions runner already isolates each suite,
which is valuable, but individual checks within a suite still share substantial
mutable context.

Create one suite execution context with explicit CLI outcome expectations,
browser lifetime, pairing and artifact reporting. Separate independent named
scenarios with deliberate fixtures. Keep a small end-to-end smoke. Reusing the
existing Playwright runner is an option, not a prerequisite; avoid building a
new general-purpose testing framework.

Preserve existing behavioral assertions and real pairing. Verify independent
scenario execution, cleanup after failure and unchanged regression coverage.
This work supports future refactoring; reducing the number of tests does not.

### Q10 — Isolate widget assumptions and instance-specific gesture state

Evidence: [Board](../../apps/web/src/features/board/Board.svelte#L95) subscribes to
global gesture events; line 161 checks dragging across the whole document; lines
229 and 346–369 depend on widget DOM/context and relocate markup.
[BoardCard](../../apps/web/src/features/board/BoardCard.svelte#L14) edits attributes
on `.wx-card`. [Gantt](../../apps/web/src/features/planning/GanttView.svelte#L271)
uses a `.wx-chart` workaround. These assumptions are spread across features.

An upgrade can preserve public widget types while changing DOM behavior that
dragging, keyboard access or scroll restoration depends on. A future second
widget instance could also receive another instance's global gesture state.
Neither trigger is claimed as a current reproduced failure.

Concentrate selectors and version-specific workarounds in a local vendor adapter,
with short explanations of why they exist and when they can be removed. Scope
gesture callbacks and selectors to the board instance using its existing context.
Retain keyboard, drag, teardown and scroll-restoration browser checks.

Respect the existing Kanban feature freeze. Schedule this maintenance when the
adapter must change or an upgrade is planned; it does not justify replacing the
widget or expanding Kanban features now.

## Smaller cleanup and publication work

- **Importance 2:** `NativeProject` and `RegistrationBrowser` repeat the
  accepted-plan/job-polling lifecycle. A feature-owned `RegistrationFlow` can
  serve both entry points when registration changes. It should retain the
  uncertain command and job across the required UI lifetime.
- **Importance 2:** central write/recovery/security chapters remain normative
  and partly Polish. Produce maintained English explanations while preserving
  unresolved obligations and traceability. `CONTRIBUTING.md` and
  `docs/CODE-STRUCTURE.md` are already useful entry points; another overview
  document is not the missing piece.
- **Importance 1–2:** replace meaningful nested options with named enums,
  for example watcher `classify`'s `Option<Option<(Kind, String)>>`; split dense
  `tokio::select!` branches and long JSON/SQL construction by named operations.
  Use descriptive CSS names when touching a surface rather than renaming the
  entire stylesheet at once. These help syntax communicate intent.
- **Publication decision, separate from code quality:** the repository records
  that the license and supported-release private security-reporting channel are
  still owner decisions. No license was selected by this audit.

Do not add traits for every concrete storage type, split crates merely to make
them smaller, remove every `unwrap` regardless of proven invariants, or turn
readable repetition into metaprogramming. In particular, do not hide filesystem
synchronization, lock order or recovery transitions to make the code look short.

## Recommended sequence

1. Correct Q01 and Q02 with focused failing regressions. Give command outcomes an
   explicit meaning before reorganizing their callers.
2. Add safe failure diagnostics and define the post-completion policy (Q05/Q06).
3. Close the low-risk typed seams and navigation ownership (Q08/Q07), one feature
   at a time. Use local replacements where they make the result clearer.
4. Consolidate browser harness duplication (Q09) as support for ongoing changes.
5. Type saved workflow plans and consolidate command-record helpers (Q04/Q03) in
   separate changes with compatibility and crash/replay verification.
6. Isolate vendor assumptions when the frozen surface next requires maintenance
   (Q10); finish contributor/publication work before a supported public release.

Completion should mean that a contributor can identify the owner of a rule,
change it in one appropriate place, and verify its behavior. It should not mean
that all files have become short or that every possible abstraction exists.

## Verification and evidence

Fresh command: `.venv-check/bin/python scripts/check.py` — **passed** on macOS
ARM64 with Node 24.11.0 and the repository's pinned Rust toolchain.

- 122 Rust tests, including subprocess durability/recovery cases.
- 68 JavaScript behavioral tests and 12 Python tests.
- Generated contracts, schemas/examples/document links, frontend typing and
  import direction check.
- Prettier, rustfmt and Clippy with warnings rejected.
- Frontend build, bundle gate and workspace release build.

The synthetic CLI response probe was also run successfully and observed the
three behaviors recorded under Q01. These probes validate the client behavior,
not daemon correctness. Browser suites, packaged installation, physical devices,
Linux execution, performance benchmarks and security penetration testing were
not rerun as part of this audit. Existing CI configuration was inspected; no
remote CI result is claimed for this working tree. Passing tests do not establish
coverage completeness or disprove the source-traced findings.

Local bulk evidence is in ignored `test-results/fresh-quality-audit-2026-09-08/`:
`local-gate.log`, `metrics.json`, `source-manifest.sha256`,
`cli-response-probe.py` and `cli-response-probe.json`. The probe can be rerun with
`.venv-check/bin/python test-results/fresh-quality-audit-2026-09-08/cli-response-probe.py`.
The concise results above remain in this report when local artifacts are absent.

Base HEAD: `2a5530a8bb83eec0c3f6f289cac8587aa9d66898`; this audit covers the working
tree on top of it. SHA-256 of the sorted source manifest:
`88e8d0581308a885a26a9181f3c64f6f2b1b0619b7283d3d3f091a63802e932d`.
No `.project` exists in the selected repository; none was initialized or written.
