# Repository audit — 2026-09-29

Audited application revision: `c0dc1f17967f35e39daa5583876979df53b571cb`.
Scope: architecture, source durability, transport/security boundaries, browser
state, tests, release performance, dependencies and maintained documentation.
This is an audit; the defects below are not fixed and no acceptance or product
scope decision is changed. Two pre-existing card edits were left untouched.

The core design is sound: shared server rules, explicit conditional writes,
durable command identity, a rebuildable index and isolated browser fixtures are
worth retaining. The immediate work is failure recovery and read-path behavior,
followed by targeted simplification. A rewrite or additional infrastructure is
not justified by this review.

## Confirmed defects

Priorities below are audit recommendations, not changes to project cards. P1
means address promptly; P2 means a concrete follow-up; P3 means lower-impact
contract cleanup. Each finding was reproduced against the current implementation.

**A01 · P1 · One invalid, unpinned card blocks the entire Focus read.**
[focus.rs](../crates/application/src/focus.rs), lines 33–44, calls the strict
[source collection reader](../crates/application/src/source.rs), lines 48–66,
for every registered project. An invalid card propagates `DOCUMENT_INVALID` from
`GET /api/v1/workspace/focus`, including when it is unrelated to the desired pins.
In a two-project fixture, corrupting one unpinned card produced HTTP 409 while
the other project's list still returned HTTP 200 and all three healthy cards.
The browser's combined view load cannot publish the other successful sections.
Unavailable project paths follow the same fail-fast code path; that variant was
inspected, not separately reproduced. Isolate read failures by project/resource,
show freshness and warnings, and preserve explicit unavailable pins. Keep strict
source/reference validation for writes. Add a healthy-project-plus-invalid-card
regression, including recovery after the source is repaired.

**A02 · P1 · A remote timezone change can put a counter total on the wrong day.**
[App.svelte](../apps/web/src/App.svelte), lines 113–120, refreshes view rows on
workspace invalidation without refreshing bootstrap timezone or week-start
preferences. [CardCounters](../apps/web/src/features/cards/CardCounters.svelte),
lines 31–32 and 64–66, continues deriving new records from the old timezone.
With a normally connected browser and no existing counter draft, changing the
workspace from Europe/Warsaw to Pacific/Kiritimati through the CLI caused three
view refreshes, but the editor still showed September 29 instead of September 30.
A subsequent increment and OK persisted `2026-09-29`. Refresh shared workspace
preferences on their invalidation and propagate them to open editors. Preserve
the original date of a draft already started before the change; new drafts must
use the updated timezone. Test both cases across two clients.

**A03 · P2 · A failed initial view read prevents live updates from reconnecting.**
[session.svelte.ts](../apps/web/src/features/session/session.svelte.ts), lines
82–87, calls `connect()` only after `ready(preferences)` succeeds. A transient
failure while loading projects skips stream creation. Ordinary refresh,
navigation and the foreground handler do not create the missing stream. A real
paired release browser was given temporary `SERVER_BUSY` responses during reload.
After removing the fault, List loaded normally, but no event-stream request was
made and a later CLI title edit remained invisible. The UI kept saying it was
recovering. Give the authenticated stream its own recoverable lifecycle, separate
from view success, without creating duplicate streams. Add this startup failure
and recovery scenario to the session browser suite.

**A04 · P2 · The 101st pin is committed before the read limit rejects Focus.**
[focus.rs](../crates/application/src/focus.rs), lines 61–62, enforces the 100-pin
limit on reads. The card mutation path has no corresponding admission check.
A synthetic fixture with 100 pins read successfully; a normal conditional PATCH
pinning another card returned `committed` and persisted the pin, after which Focus
returned HTTP 422 `FOCUS_LIMIT`. Enforce the limit atomically at membership changes
and keep reads usable when external source edits exceed it. Test concurrent pins
at the boundary and allow unpinning to recover. Merely disabling a browser button
would leave CLI/API writes and cross-host source changes uncovered.

**A05 · P2 · Focus pagination expires every minute even without data changes.**
[views/focus.rs](../crates/application/src/views/focus.rs), lines 28–33, includes
the current minute in every cursor, including date-only plans. The same pattern
exists in [attention.rs](../crates/application/src/views/attention.rs), lines
51–78. A page-of-one cursor worked immediately and returned `PAGE_STALE` after
28.9 seconds at the next minute boundary, with unchanged sources. The browser's
minute refresh then resets paged collections to their first page. Use a day scope
for date-only plans and a bounded, explicit observation time or meaningful event
boundary for timed results. Preserve cursor invalidation for actual data changes.
Test staying on a later page across an ordinary minute and across a real expiry.

**A06 · P2 · Browser command confirmation does not verify command identity.**
[api.ts](../apps/web/src/lib/api/api.ts), lines 213–254, accepts a minimal success
shape without matching `request_id`, checking `api_version`, or validating the
expected result kind. Status handling shares that boundary. In a transport probe,
the real `CommandController` accepted `api_version: "999"` and another request's
ID, became `committed`, and cleared its pending command. This was injected faulty
transport data, not a claim that the current daemon emits such replies. The CLI's
[response validator](../crates/projectctl/src/transport/response.rs) already
checks these invariants. Apply equivalent confirmation checks to browser direct
and status replies; malformed/mismatched replies must retain uncertainty and the
original command. Add wrong-ID, missing-field and incompatible-version cases.

**A07 · P3 · A report representation changes without changing its strong ETag.**
[engine.rs](../crates/application/src/engine.rs), in `get`, adds the mutable
`read` flag to a source-versioned report. [dispatch.rs](../crates/projectd/src/dispatch.rs),
lines 482–500, sends that source version as a strong HTTP ETag. Two actual HTTP
reads before/after a normal read-receipt write returned different `read` values
and identical ETags. Source-backed Focus membership also uses the workspace-file
version as a response ETag, although pinning changes card files. Keep conditional
source-write versions separate from validators for enriched representations.
Remove that ETag where it does not validate the complete response, or define a
separate representation validator. API `no-store` limits the immediate cache
impact; no data-loss consequence was observed in this probe.

## Performance and simplification

Measurements used release builds on macOS 27.0 ARM64, Apple M4, 16 GiB RAM. Tests
and builds had finished before the timed workloads; the existing manual app
remained running. These are local application timings, excluding HTTP, VPN,
browser rendering and steady-state RSS. They are not full release acceptance.

| Workload | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| Indexed search, 1,000 cards / 500 reports | 200 | 1.22 ms | 1.46 ms |
| Attention, same dataset | 200 | 4.59 ms | 5.31 ms |
| Durable mutations, 40 creates + 160 title edits | 200 | 26.86 ms | 323.26 ms |
| Creation subset | 40 | 317.83 ms | 337.04 ms |
| Title-edit subset | 160 | 26.45 ms | 31.01 ms |
| Focus membership, 1,000 cards / one pin | 20 | 172.57 ms | 206.23 ms |
| Focus membership, 10,000 cards / one pin | 20 | 1,778.73 ms | 1,811.91 ms |
| Indexed list, same 10,000-card fixture | 20 | 8.38 ms | 8.66 ms |

**A08 · P2 · Repeated complete source scans are the measured optimization target.**
Focus parses every card and sorts all cards before selecting pins. The browser
then fetches pinned resource details separately. At 10,000 cards, membership
alone already exceeds the one-second interactive Focus target. Card creation
also reads the full source collection, sorts siblings and retains their versions
in [mutation.rs](../crates/application/src/mutation.rs), `prepare` and
`resolve_placement`; the mixed mutation workload exceeds the 150 ms p95 target
even at 1,000 cards. Profile the individual phases before changing the writer.
Use the incremental projection for ordinary display with explicit freshness,
reduce unnecessary materialization/sorting, and keep authoritative source checks
at write boundaries. Preserve fsync, journal ordering and external-change guards.
The focused read benchmark has only 20 samples; mutation percentiles use the
required 200 measured operations after 20 warmups. The full 100-project / 50,000-
report acceptance profile remains unmeasured in this audit.

**A09 · P2 · Maintained instructions contradict the implemented product.**
[DEVELOPMENT.md](../DEVELOPMENT.md), lines 120–124, still promises card connections,
blockers and independent deadlines. [MANUAL-TESTING.md](../MANUAL-TESTING.md),
line 164, says there is no hourly model. [STATE.md](STATE.md), in its implemented
product list, retains relations and workspace tags as current features. These
conflict with the later scope decisions and implemented timed events/project tags.
Correct maintained guides and shorten STATE to current facts plus links. Retain
historical ADRs/evidence with clear supersession and keep unresolved requirements.
Do not erase the historical record to make the documentation appear consistent.

The clearest excess is accumulated coordination material and component duties:

- `progress/` has 110 tracked files and 9,700 lines before this audit; docs and
  delivery add 50 files and 5,812 lines. Prefer one current status/limitations
  entry point and an indexed historical archive. File count alone is not a reason
  to delete evidence; preserve immutable references and outstanding acceptance.
- `Editor.svelte` has 1,507 lines and coordinates autosave, comments, counters,
  deletion, conflicts, history and rendering. `App.svelte` has 939 lines;
  Calendar has 827 and Board 745. Extract cohesive editor/session orchestration
  responsibilities and test their behavior, keeping explicit ownership. Avoid
  adding generic repositories, event buses or wrappers merely to shorten files.
- Legacy workspace tag APIs remain intentionally supported alongside project
  tags. Decide and document a compatibility lifetime before retiring them; the
  present UI no longer needs two vocabulary models. Existing milestone support
  also needs an explicit owner decision before removal or replacement by events.
- Browser coverage is valuable, but its 11,414 lines include a 1,529-line broad
  smoke scenario and repeated setup/interactions. Keep one concise broad smoke,
  put feature behavior in focused suites, and add the failure-boundary cases
  above. Do not reduce tests simply because they are numerous.

The initial JS/CSS bundle is 140,974 gzip bytes (137.7 KiB) against a 300 KiB
budget. Bundle size is not the present bottleneck. Keep lazy planning views and
the small shared component set. The five Rust crates reflect useful boundaries;
there is no evidence here for adding services, queues or a second persistent
source of truth. Kanban's existing feature freeze remains appropriate.

## Verification, limits and recommended order

The full local gate passed: 232 Rust tests, 109 JavaScript tests, 12 Python tests,
source/API contracts and examples, OpenAPI validation, frontend types, import
boundaries, formatting, Clippy, bundle budget and release builds. Broad release
HTTPS smoke, the dedicated planning browser check and all 17 maintained Chromium
regression suites passed. The seven targeted defect probes above reproduced
failures outside that existing coverage. No application source was changed.

`npm audit --json` reported zero known vulnerabilities. An exact-version scan of
270 Cargo/Python dependency entries through the documented
[OSV batch API](https://google.github.io/osv.dev/post-v1-querybatch/) returned no
matches and no pending result pages on 2026-09-29. These are advisory-database
results, not a security proof. The CI gate currently does not run those scans;
add a scheduled advisory check and define triage rather than silently updating
lockfiles. Packaging already collects notices, but a machine-readable SBOM and
revision/build identity would improve release traceability.

The inspected security boundaries retain Host/Origin/CSRF checks, normal pairing,
same-UID local admission, body/time/concurrency bounds, escaped Markdown without
automatic image fetching, bounded Git subprocesses, descriptor-relative path
checks and explicit durable recovery. This audit did not reproduce an auth bypass
or weaken any of those controls. It was not a complete penetration test.

Physical iPhone/Safari, Arch/ext4, power-loss, login-start and full performance/
reliability acceptance remain open. This run does not establish remote CI status,
repeat packaged installation acceptance or approve a supported public release.
License and security-reporting policy remain the owner's recorded decisions.

Recommended sequence:

1. Add failing regressions and fix A01–A03: failure isolation, workspace date
   propagation and live-update recovery.
2. Fix A04–A06 and cover limits, minute boundaries and malformed confirmations.
3. Optimize the measured read/create paths in A08; compare release measurements
   and rerun durability/conflict regressions. Address A07 with its contract update.
4. Correct A09, reduce editor/session coordination coupling, and agree the legacy
   API/milestone direction before removing features.

Detailed logs, synthetic probes, screenshots and benchmark output are in ignored
`test-results/audit-2026-09-29/`. Reproduction entry points are `probes.mjs`,
`additional-probes.mjs` and `focus-bench/`; all use disposable synthetic projects.
The repository benchmark command was `target/release/examples/benchmark 1 1000
500`. No runtime credentials, live project content or bulk output is included in
this evidence record. The manual application was not restarted because this task
changed no application behavior.
