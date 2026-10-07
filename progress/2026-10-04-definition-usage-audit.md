# Definition and consumer audit — 2026-10-04

Baseline commit: `c226e7296d41f262e1b89ae7d87a9854076d858b`, plus the existing
uncommitted Projects/navigation/card-layout work. This is an audit, not an
implementation or a product-retirement decision. Existing source edits were
preserved. No application code was removed or changed.

The repository has concrete unused definitions and two documented HTTP operations
without implementations. It does not have an abandoned production frontend
component/module. One CLI-to-API workflow mismatch was also reproduced.

## Coverage and classification

- All 151 production TS/Svelte modules and 66 Svelte components are reachable
  from the browser entry point, including deferred imports, vendor component
  callbacks and three calendar build-injection targets. All six CSS files and
  all 30 icons have consumers. The remaining frontend source files are one
  ambient declaration and two intentional compile-time test files.
- All five frontend production dependencies are imported. All 121 Rust files
  (80 under `src`), five crate manifests and 47 ordinary direct dependency
  declarations were inspected. Tests, benchmarks, trait/serde callbacks and
  platform-specific modules were classified separately from daemon calls.
- OpenAPI declares 71 operations: 69 have dispatcher handlers; two do not.
  All ten declared local IPC operations have dispatcher/CLI connections.
  Named CLI calls, browser calls and generic API access were considered
  separately; generic access alone does not prove that an external client exists.
- Maintained scripts have entry points through imports, package scripts,
  filename-based test discovery, CI or explicit documented commands.

HTTP consumer classification after excluding dormant wrapper/cache call paths:

| Active first-party connection | Operations |
| --- | ---: |
| Browser and named CLI | 32 |
| Browser | 23 |
| Named CLI | 9 |
| Retained legacy compatibility | 3 |
| Implemented, no active first-party caller (`tag-suggestions`) | 1 |
| Operational health | 1 |
| Contract-only registration operations | 2 |

These are static call-path counts, not runtime telemetry. CLI-only capabilities
include profile renaming, agent context, source collections, milestone creation,
report deletion, search and source validation. Existing milestones can still be
opened/edited through date views, attention and deep links.

Generated types intentionally expose all contract schemas. Standalone source
envelope schemas and stream-event schemas are not ordinary JSON response routes;
unused generated exports alone are not removal evidence. Reachability does not
prove that every branch executes or every public field has an external consumer.

## Confirmed findings

**U01 · P2 · OpenAPI advertises two unimplemented registration operations.**
[OpenAPI](../contracts/openapi.yaml), lines 811–879, defines
`GET /api/v1/registrations/{project_id}` (`getRegistration`) and `DELETE` on the
same path (`unregisterProject`). Neither has a dispatcher arm or application
entry point. `RegistrationResource` at line 5236 serves only that ghost GET.
On a normally initialized, paired synthetic release host, reading the registered
project returned 200, while both registration operations returned 404 `NOT_FOUND`,
including a DELETE with valid conditional-command headers. The actual local
maintenance `unregister` plan returned 200. Resolve this contract drift against
the supported local administrative flow, updating generated types, examples,
regression coverage and an ADR together. Do not infer permission to expose a
new remote administrative operation.

**U02 · P2 · CLI tag rename uses command confirmation for a workflow reply.**
[typed.rs](../crates/projectctl/src/typed.rs), lines 373–383, routes `tags rename`
through the ordinary command request builder. The server returns a workflow
Accepted response with HTTP 202; [response.rs](../crates/projectctl/src/transport/response.rs),
lines 30–36, accepts 202 for ordinary commands only as unresolved command status.
A synthetic `Before` → `After` rename exited 9 with `RESULT_UNCERTAIN` and
“Invalid command response”, although a fresh source read showed `After` and the
original command status was `committed`. The browser already treats this as a
workflow. Use the existing workflow request/confirmation boundary in CLI and add
a failing end-to-end regression before fixing it. The generic API classifier in
[transport.rs](../crates/projectctl/src/transport.rs), lines 114–130, also lacks
project-tag preview/rename classifications; that related path was inspected
statically, rather than separately reproduced.

**U03 · P3 · Retired browser tag machinery still has definitions and tests.**
[tag-suggestions.ts](../apps/web/src/features/tags/tag-suggestions.ts), lines
10–85, retains a global cache, `loadTagSuggestions` and `rememberTagSuggestions`
without consumers. App only clears it. [TagPicker](../apps/web/src/features/tags/TagPicker.svelte),
lines 67–80, reads fresh project tags directly. Remove the unused cache and its
obsolete tests, preserving the used `tag-suggestions-changed` notification and
session invalidation behavior. `TagPicker` still subscribes to that notification.
[tag-management.ts](../apps/web/src/features/tags/tag-management.ts), lines
15–48, also retains `TagChangeResult`, `catalogNames`, `destinationTag` and
`canFinishTagChange` only in their old helper/test subsystem. Current TagManager
uses `catalogNameError`, which remains necessary.
The implemented `GET /api/v1/workspace/tag-suggestions` endpoint consequently
has no active browser or named CLI consumer. Consider its compatibility lifetime
separately from removing the internal cache; generic CLI/external access remains
possible, and no public endpoint retirement was authorized by this audit.

**U04 · P3 · Five browser endpoint wrappers have no production consumers.**
[resources.ts](../apps/web/src/lib/api/resources.ts), lines 53 and 96, exports
`getFocus` and `createUpdate`; [tags.ts](../apps/web/src/lib/api/tags.ts), lines
10–24, exports `getTagCatalog`, `previewTagChange` and `replaceTags`. Only the
last two have compile-time negative-test consumers. Focus actually reads through
`view-queries.ts`, and report creation uses the editor's resource path. Remove
unneeded wrappers or deliberately adopt the applicable named wrapper. Preserve
endpoint typing tests against maintained operations. This finding concerns
internal browser functions, not removal of the server endpoints.

**U05 · P3 · Card helpers and component variants survive only as dormant surface.**
[card-counters.ts](../apps/web/src/features/cards/card-counters.ts), line 57,
defines test-only `adjustCounter`; CounterRow uses `setCounterValue` and
`setCounterInput`. [card-work.ts](../apps/web/src/features/cards/card-work.ts),
lines 68–100, retains test-only `AcceptanceRowRect`, `acceptanceDropIndex` and
`moveAcceptance`; current checklist ordering uses the shared gesture calculation,
`moveAcceptanceToIndex` and `reorderAcceptance`. Remove obsolete helpers and
retarget relevant coverage to the actual production path.

[Brand](../apps/web/src/lib/ui/Brand.svelte), line 2, has a `compact` variant never
requested by its only caller. [ResourceCard](https://github.com/Maciej1kti/astra/blob/bc4689261c2f2f7b8f6a3a80668921dcd70a3fde/apps/web/src/lib/ui/ResourceCard.svelte),
lines 11–21, accepts `pinned`, `showStatus` and `children`, none supplied by its
only consumer, BoardOverview. Simplify dormant branches while preserving the
currently rendered behavior. [calendar-events.ts](../apps/web/src/features/planning/calendar-events.ts),
line 7, exposes test-only `calendarEvents`; production uses
`calendarEventProjection`. Move the reference adapter into test support or adapt
the tests, retaining meaningful calendar conversion coverage.

**U06 · P3 · Two store helpers unnecessarily enlarge production Rust surface.**
[Inventory::root](../crates/project-store/src/tree_removal.rs), line 60, has no
callers anywhere in the repository. [ParsedDocument::editable](../crates/project-store/src/document.rs),
line 48, has only two tests and is the sole constructor of
`StoreError::NormalizationRequired`; the remaining production reference merely
classifies that error for diagnostics. Actual write admission checks
`normalization_required` independently in [writer.rs](../crates/application/src/writer.rs),
line 231. Remove the unused helper/error path and adapt parser tests; preserve
the writer's rejection, normalization workflow and application regressions.

**U07 · P3 · Two dependency declarations can be narrowed.**
[projectd/Cargo.toml](../crates/projectd/Cargo.toml), line 17, declares `rusqlite`
as an ordinary dependency, but its direct uses are entirely inside `cfg(test)`.
Move it to dev-dependencies. Application still requires SQLite, so this does not
remove SQLite from the daemon. [Cargo.toml](../Cargo.toml), line 28, enables
`reqwest/query`, although query strings are built with `url` and no reqwest query
builder is used. Trim that feature and verify the full gate; no binary-size
saving was measured or assumed.

**U08 · P3 · Five CSS tokens have no consumers.**
[tokens.css](../apps/web/src/styles/tokens.css), lines 84, 85, 108, 133 and 138,
defines `--description-min-height`, `--calendar-cell-height`,
`--calendar-min-height`, `--layer-dialog` and `--green`. No source, build helper
or installed calendar/Gantt/Kanban vendor source references them. The `--green`
comment claiming an existing vendor consumer is stale. Remove these definitions
and the stale comment. The global class-selector scan found no confirmed
unreferenced class names; it does not prove every selector combination is active.

## Narrowing and active-work follow-ups

Several implementations remain used within their own module but do not need an
export: `chartCatalogLimit`, `TAG_LENGTH_LIMIT`, `resourceKey`,
`groupedAttention`, `isStalePage` and `abortError`. `Metadata` and `CommandState`
in `lib/api/api.ts` are unused type aliases. Narrow these internal definitions
without deleting their used behavior. `chartPoints` and `acceptanceProgress`
have actual internal calls plus direct behavioral-test consumers; those exports
are justified.

In the pre-existing dirty navigation/card-layout work, `moveNavigationItem` has
no callers and `moveCardSection`/`moveCardSectionTo` now have only tests after
switching to `OrderVisibilityList`. Recheck them against the integrated revision
before removing them; this audit did not modify those concurrent files.

## Intentionally retained surface

Milestones and legacy workspace tag endpoints remain supported under recorded
owner decisions. Browser non-use does not authorize deleting them or their
source formats. Local roots, maintenance, registration plans and host-native
selection are operational/CLI capabilities. Undo/history, durable command status,
jobs and event streams have real consumers even when there is no separate view.

Rust `attention` convenience methods, `Engine::open` and `refresh_all` have
maintained benchmark/test consumers. `Service::new` is a test convenience
constructor. These can be consolidated after migrating consumers; they are not
unreferenced application features. Linux portal dependencies are used on Linux.
`ops/server.example.toml` and service `.in` files are explicitly documented
historical/illustrative material, not supported runtime configuration.

## Verification and recommended cleanup order

Passed on the current working tree:

- `npm run check`: generated types current; zero Svelte/TypeScript diagnostics.
- `scripts/cargo-local clippy --workspace --all-targets --locked -- -D warnings`.
- `.venv-check/bin/python scripts/check_package.py`: contracts, examples,
  references, Markdown links, package and template validation.
- Two isolated release-host probes: registration-route drift and CLI tag-rename
  confirmation mismatch. Temporary hosts/projects were removed.

First fix U02 with a regression and resolve U01's contract drift. Next remove the
proven internal residue in U03–U08, preserving used notifications and replacing
obsolete tests with production-path coverage. Finally consolidate optional
exports/convenience methods after concurrent work settles. Any later protocol
change needs its complete contract/ADR/examples/tests update; any application
cleanup needs the full gate and applicable real-daemon browser checks before
rebuilding/restarting the owner's existing manual app.

Detailed inventory, scripts and probe/log output are in ignored
`test-results/usage-audit/`. This audit ran no full test/build gate or new broad
browser suite, changed no live project contents except its coordination report,
and did not rebuild/restart the manual application. It establishes local
reachability and the specified reproductions, not physical-device, Linux runtime,
external-client, complete branch-coverage or release acceptance.
