# Definition and API consumer cleanup — 2026-10-04

The owner authorized implementation of all findings from the
[definition/consumer audit](2026-10-04-definition-usage-audit.md). The audit remains
the historical baseline; this report records its resolution. Concurrent Projects,
shared ordering and Polish interface changes are preserved and excluded from the
cleanup commit.

## Resolution

- U01: remove the two never-implemented registration HTTP operations and their
  response schema. Host-local maintenance unregistration remains available.
- U02: named and generic project-tag renames use workflow confirmation; generic
  project-tag previews use the read boundary. Accepted jobs retain their original
  request ID/epoch and expose the job/status instead of a false uncertain result.
- U03/U04: retire the unused indexed tag-suggestion endpoint/schema/example,
  global browser cache, obsolete tag-management helpers and five unused browser
  wrappers. Fresh project-source catalogs, mounted-reader notifications and
  session-owned invalidation remain connected.
- U05: remove unused counter/checklist/calendar adapters and Brand/ResourceCard
  variants. Behavioral tests exercise the current production paths. Remove
  orphaned card decoration selectors exposed by the component simplification.
- U06/U07: remove unused store helpers and their unreachable error/diagnostic arm;
  narrow `rusqlite` to daemon test dependencies and remove the unused reqwest query
  feature. Writer admission, original-byte versions and normalization regressions
  retain their existing protections; dependency versions do not change.
- U08 and follow-ups: remove five unused CSS tokens, unused API aliases and excess
  exports; remove navigation/card-layout movers superseded by shared ordering.

Milestones, legacy workspace tag compatibility operations, used convenience APIs,
benchmarks and generated contract definitions with legitimate consumers remain.
The retained HTTP contract has 68 operations. [ADR-065](../docs/ADR-065-DEFINITION-SURFACE-CLEANUP.md),
generated contracts, CLI instructions, architecture notes, benchmark documentation
and an executable project-tag request example accompany the implementation.

## Verification

The original release daemon first reproduced the tag rename bug: the source had
committed while CLI reported `RESULT_UNCERTAIN`. The regression now verifies both
named and generic previews/renames, accepted job replies, command/job status,
unchanged retries, removed-route 404s and local unregister preserving sources.
Synthetic resources live only in temporary test hosts.

The isolated cleanup full gate passes, including schemas/examples, Python and
JavaScript checks, Svelte/TypeScript, architectural boundaries, formatting,
initial bundle budget, all-target Clippy, Rust tests/durability coverage and release
builds. A final focused pass checks the adjusted tests, the release CLI fixture
and documentation links. Independent review found no remaining consumer or
invariant violations in the cleanup delta.

The integrated full gate also passes with concurrent Projects/shared ordering and
Polish interface work: 342 Rust, 268 JavaScript and seven Python tests (617 total),
zero Svelte diagnostics, generated contracts/examples, all-target Clippy and release
builds. Initial JavaScript/CSS is 79,135 gzip bytes against the unchanged 81,920-byte
budget. Earlier integration attempts caught temporary concurrent import/bundle
issues; the final gate passes without weakening checks.

Six affected WebKit suites pass: tags, editor opening, card/checklist behavior,
counters, card layout and navigation. Desktop and 320/390px rendered tag, layout
and counter artifacts were inspected. All 36 isolated Chromium regression suites
pass, together with broad normally paired HTTPS and planning smoke workflows.
Five final localized integration suites also pass: tags, editor opening, counters,
card layout and navigation. Display-text assertions were adapted to the concurrent
translation while persisted/data-selector identifiers retain their canonical keys.
Those test-only localization adaptations are excluded from the cleanup candidate,
which retains the independently verified English baseline.

## Existing manual application

The final frontend type check and release rebuild pass; the rebuilt initial bundle
is 79,133 gzip bytes. The existing launcher/daemon was restarted using its same
data directory, ports, public origin and certificate. Trusted HTTPS verifies
`https://100.122.250.14:47832` and exact hashes of all 61 served assets.

Before/after snapshots preserve all 36 resource versions (original-byte hashes),
two Focus pins, both users/profiles, their preferences/project roots/registrations,
instance ID, command epoch and certificate. A normally paired read-only live check
renders Projects, Focus and List at 1440px and 320px, retaining the default Maciek
profile and personal durable state. All 15 projects render; no browser, console or
API errors and no attempted writes occur. Rendered desktop/mobile artifacts were
inspected. The resulting short project report is appended through `projectctl`;
it intentionally becomes new source data after this preservation comparison.

Logs, private staging snapshots and rendered artifacts are kept under ignored
`test-results/usage-cleanup/`. macOS and browser emulation coverage does not
establish physical iPhone behavior, Linux deployment or complete release acceptance.
