# ADR-053: Daily counter previews in pinned Focus cards

Status: accepted implementation, 2026-09-30.

Pinned cards expose compact daily controls without downloading each card body
and counter history. `GET /api/v1/workspace/focus` projects optional
`Summary.daily_counters` alongside the existing membership snapshot. Each ready
card includes at most 20 active counters with ID, name, unit, step, explicit
workspace-calendar date and that day's absolute value (zero if unrecorded).
Hidden counters and historical values are omitted. Unverified retained sources
omit the field; older hosts remain compatible. Other summary endpoints remain
unchanged in this original decision; [ADR-059](ADR-059-FOCUS-SECTION-COUNTERS.md)
later extends daily previews to In motion and Events. The 100-pin cap and existing
freshness/completeness rules still apply.

The containing card version and daily preview are observed together. This is a
narrow exception to ADR-051's resource-read-before-editing guidance: recording a
preview's total can use its observed card version directly. Opening the full
editor still reads the current resource. Writes use the existing exclusive
`record_counter`, conditional version and durable idempotency contracts; neither
the mutation protocol nor the source format changes.

The browser keeps one explicit counter draft above view/filter navigation.
Horizontal scrubbing, arrow keys and numeric entry only change the draft. Save
records an absolute total for the originally observed day; midnight and refresh
cannot move a draft to another date or replace its base version. Vertical scroll,
pointer cancellation, Escape and secondary touches cannot submit a value.
Unconfirmed commands retain payload, request ID, epoch and version; retry/check
and command-copy controls remain available after navigation or reconnection.
Conflicts keep the draft and require explicit discard/refresh, with no automatic
refetch-and-overwrite. Confirmed response values cover a failed refresh without
masking a subsequently observed version.

Calendar selection is local presentation state: a shared native modal displays
one civil month, workspace week-start preference, range endpoints, today and
keyboard navigation. Applying valid dates updates the existing editor draft and
its autosave pipeline. Cancel and Escape discard only the calendar proposal.
There is no second date-write path.
