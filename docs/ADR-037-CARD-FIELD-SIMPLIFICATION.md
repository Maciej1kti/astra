# ADR-037 — Simplify card metadata

Status: accepted by the owner, 2026-09-22. The planning fields described here
are subsequently superseded by [ADR-039](ADR-039-CARD-PLANNING-SIMPLIFICATION.md).

## Decision

Cards no longer have the `kind`, `expected_result`, or `owner` fields. The
removal applies to the source front matter, domain and API schemas, CLI payloads,
generated contracts, projections, and editor controls. Cards retain lifecycle
status, priority, scheduling, labels, ordered acceptance items, and bounded
`x-*` extensions. Card extension support is subsequently superseded by
[ADR-038](ADR-038-CARD-EXTENSION-REMOVAL.md). Card planning simplification is
recorded in ADR-039. `Update.kind` remains a report field; milestone due has
only a date.

The server keeps strict validation. A versioned create or patch containing a
removed field is rejected without changing the source. Existing history and
journals remain available for audit; an old Undo snapshot that would reintroduce
a removed field is rejected by the same validation rules.

## Compatibility rollout

Five live cards, including the archived card, are cleaned with a temporary
compatibility build through normal versioned PATCH commands before the strict
contract is deployed. No direct source edits or migration framework are used.
The cleanup preserves card bodies, retained metadata, extensions, reports, and
history. The temporary compatibility path is removed after the cleanup. ADR-038
later closes the card metadata field set after confirming that the live cards
contain no card extensions.

## Consequences

Clients must use status, acceptance, labels, schedule and reports to express
current card intent. Search, context, and list projections no longer index or
expose the removed fields. The Markdown body remains authored content;
the removal does not rewrite headings or infer replacement values.
