# ADR-036: Remove project phase, review date, and extensions

## Status

Accepted — 2026-09-22

## Decision

Project metadata has the closed field set `schema_version`, `id`, `name`,
`state`, `created_at`, and `updated_at`. Project documents no longer accept or
emit `phase`, `review_on`, or `x-*` extension fields. The project patch API
accepts only `name`, `state`, and `body`; its `clear` operation is removed.

Card metadata extensions are removed by [ADR-038](ADR-038-CARD-EXTENSION-REMOVAL.md);
card planning fields are subsequently simplified by
[ADR-039](ADR-039-CARD-PLANNING-SIMPLIFICATION.md). Milestone and update
extension rules remain unchanged.

The JSON Schema and OpenAPI contracts use closed project metadata objects, and
the generated browser contract types are regenerated from those sources.
Examples and the maintained browser fixture no longer describe the removed
project fields. A project editor exposes name, state, and Markdown description;
it does not present controls for the removed fields.

## Compatibility and cleanup

Before deployment, the owner cleans existing live project sources through the
current versioned API using the observed version. The cleanup removes the
legacy project fields and preserves the project body, required metadata, and
unrelated supported fields. It is an explicit bounded operation; this change
does not add a source migration framework.

Old project files containing removed fields fail strict validation until the
owner cleanup has completed. History remains durable for audit. An old project
history undo that would reintroduce a removed field is rejected by the current
schema and cannot resurrect unsupported metadata.

## Consequences

Project summaries and search results no longer expose `phase`. Clients use card
schedules and reports for current card planning. A client sending removed
project fields receives normal schema validation failure and must not retry the
same unsupported payload.
