# ADR-040 — Simplify card priorities

Date: 2026-09-22

## Decision

Cards use the two-value priority enum `normal | high` in the source format,
domain contract and HTTP/CLI interfaces. Card list filters use the same enum.
The browser and CLI expose these values directly, and generated contract types
are derived from the checked-in schemas.

`low` and `urgent` are no longer valid wire values. Existing data is handled by
an explicit, versioned conditional write before strict validation is enabled:
`low` maps to `normal`, and `urgent` maps to `high`. The operation preserves the
card body and other metadata and requires the observed resource version. It is
never an implicit parser conversion or a refetch-and-overwrite retry. The owner
inventory for the current projects contains only `normal` priorities, so this
change requires no data migration in those projects.

## Compatibility and boundaries

The valid priority spellings remain lowercase and the API version is unchanged.
Readers and writers reject removed values after the contract change, with the
normal source-validation and conditional-write error handling. Query parameters
are constrained to `normal` and `high` so the API, backend validation and
generated browser types describe the same domain. Unsupported priority filters
return `422 INVALID_PRIORITY_FILTER`. Stale index summaries omit retired values
until their source can be validated and indexed again.

This change does not alter ordering, status transitions, archival behavior or
the durability and conflict protocol for card writes.
