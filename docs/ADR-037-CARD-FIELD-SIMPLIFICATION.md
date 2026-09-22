# ADR-037 — Simplify card metadata

Status: accepted by the owner, 2026-09-22.

## Decision

Cards no longer have the `kind`, `expected_result`, or `owner` fields. The
removal applies to the source front matter, domain and API schemas, CLI payloads,
generated contracts, projections, and editor controls. Cards retain lifecycle
status, priority, scheduling and due dates, review dates, milestones, blocking
information, dependencies, labels, ordered acceptance items, and bounded `x-*`
extensions. `Update.kind` and `Due.kind` are unrelated fields and remain part of
their contracts.

The server keeps strict validation. A versioned create or patch containing a
removed field is rejected without changing the source. Existing history and
journals remain available for audit; an old Undo snapshot that would reintroduce
a removed field is rejected by the same validation rules.

## Compatibility rollout

Five live cards, including the archived card, are cleaned with a temporary
compatibility build through normal versioned PATCH commands before the strict
contract is deployed. No direct source edits or migration framework are used.
The cleanup preserves card bodies, retained metadata, extensions, reports, and
history. The temporary compatibility path is removed after the cleanup.

## Consequences

Clients must use status, acceptance, blocking, review, labels, and relationships
to express current card intent. Search, context, and list projections no longer
index or expose the removed fields. The Markdown body remains authored content;
the removal does not rewrite headings or infer replacement values.
