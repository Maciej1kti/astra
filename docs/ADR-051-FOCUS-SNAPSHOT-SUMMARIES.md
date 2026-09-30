# ADR-051: Focus summaries share the membership snapshot

Status: accepted implementation optimization, 2026-09-29.

The release loading profile found that ten pins added four waves of individual
card reads after Focus's other sections. Those reads downloaded full bodies only
to discard them when producing card summaries.

`GET /api/v1/workspace/focus` now includes `cards`, up to 100 card summaries from
the same locked projection snapshot as its ordered `items`. The indexed pin
membership query joins retained documents by their primary key. It preserves the
100-pin cap, overflow warnings, registration/order rules and workspace operation
gate. No source scan, new cache, stronger freshness claim or write-path change is
introduced.

Pending projects mark summaries stale. Invalid/unavailable retained rows keep
their availability, and saved references with no projection row have no summary.
Their positions remain in `items`; the browser renders an unavailable placeholder
without issuing a speculative detail read. Incomplete membership still disables
reordering. Source version fields remain conditional-write inputs, not a strong
validator for the whole Focus representation; the existing no-ETag rule remains.

The new field is optional in the response schema to retain compatibility with
reference-only hosts. Current hosts always send it, including an empty array.
The browser follows `items` for order, uses the summary keyed by project/card ID,
and keeps its bounded old detail-read path only when `cards` is absent. Opening
any card still fetches its current source resource before editing. No endpoint,
legacy workspace API or source format is removed.

Regression coverage includes source versions and absent bodies, pending/invalid/
unavailable sources, absent rows after index loss, overflow bounds, order-preserving
client mapping, a reference-only host and the absence of individual pin reads in
normal browser startup. Release measurements and device limits live in the
[performance evidence](../progress/2026-09-29-performance-optimization.md).
