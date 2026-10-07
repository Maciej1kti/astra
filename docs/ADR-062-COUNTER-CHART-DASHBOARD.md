# ADR-062: Bounded counter histories for Chart

Status: implemented from owner direction, 2026-10-04.

The owner requested a workspace Chart view for selecting and comparing daily
card counters, inspecting statistics and multiplying quantities by a chosen
rate. Counter histories already belong to card source metadata. Chart consumes
their read-only projection; it introduces no second history store or mutation.

`GET /api/v1/views/counters` returns `CounterSeriesPage`: at most 100 series
with their configuration, archive state, card/project context, observed card
source version and saved values clipped to `from`/`to`. Dates are inclusive,
with at most 400 civil dates per request. SQL first filters and pages counter
membership, then materializes the bounded date maps. The serialized response
is capped at 2 MiB. Counter IDs are interpreted alongside card/project IDs.
The CLI's `view counters` uses the same application read and exact optional
project selection.

A missing date remains absent and an explicitly recorded zero remains present.
Counters with no selected-range values remain discoverable. Completed and
cancelled cards keep their histories. By default counters, cards and projects
with archive flags are excluded; `include_archived=true` includes all three.
Invalid/unavailable source projections are omitted with a completeness warning
and stale page freshness. Startup reconciliation marks retained series stale;
an empty stale page never establishes the absence of counters. Source bytes
are never reconstructed or repaired from the index.

Cursor identity binds the project scope, dates, archive flag, limit and current
scoped projection revision. Relevant source changes and query changes reject a
continuation with `PAGE_STALE`; unrelated project writes preserve a project-scoped
page. Public snapshot cursors retain the global SSE sequence. Ordinary admission,
profile scoping and authenticated bounded-read compression apply unchanged.

The new `chart` route may be stored as `Preferences.default_view`. Chart's series
selection, plot modes and rate calculations are browser presentation; they do
not alter source units or recorded totals. Since
[ADR-072](ADR-072-COUNTER-RATES-AND-HISTORY-TOTALS.md) the rate itself is
counter configuration and each series carries whole-history totals. Opening a card still reads its current
source before editing. Synthetic histories are limited to disposable test projects
and are never inserted into the owner's counters.

Engine regressions cover sparse/zero and inclusive range semantics, empty
discovery, archived hierarchy, completed cards, source-version observations,
source byte preservation, scoped pagination/staleness, pending/invalid sources,
400-date/100-series byte bounds and the persisted Chart default. Transport and
CLI regressions verify strict query parsing and exact scope forwarding. Browser
tests exercise the dashboard through an actual release daemon with temporary
synthetic projects.
