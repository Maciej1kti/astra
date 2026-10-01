# ADR-059: Daily counter previews across Focus sections

Status: accepted implementation correction, 2026-10-01.

In motion and Events reuse the pinned Focus card presentation, but their bounded
`GET /api/v1/views/focus-cards` pages previously returned ordinary summaries
without daily counters. The shared component therefore could not render its
counter footer. These pages now reuse ADR-053's daily preview projection.

Each verified card includes at most 20 active counters for the workspace-local
calendar date, with zero for an unrecorded day. Counter history, bodies and archived
counters remain absent; unverified rows omit the preview. Values and the conditional
card version come from the same index snapshot. Membership, order, paging bounds,
projection freshness and cursor scope remain unchanged. There are no per-card
source reads, additional endpoints or source/storage format changes.

The existing optional `Summary.daily_counters` schema covers all three Focus
card sections. Their controls use the existing route-independent counter owner,
explicit Save, conditional record command and retained recovery semantics. A stale
preview cannot overwrite a competing edit. Opening the editor still reads current
source. List, Board and planning summaries remain unchanged.
