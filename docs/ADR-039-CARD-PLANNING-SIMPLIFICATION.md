# ADR-039: Simplify card planning fields

Status: accepted by the owner, 2026-09-22.

## Decision

Cards keep one planning field, `schedule`, with inclusive `start` and `end`
dates. Card deadlines, review dates, milestone links, blocking metadata and
card to card dependencies are removed from source documents, API payloads,
projections and editor contracts. A card's attention due signals use the end of
its explicit schedule. Cards without a schedule do not produce a date based due
signal.

Milestones retain an optional `due` object containing only `date`. Milestone
attention may report `overdue` or `due_soon` from that date. The generic target
contract remains capable of targeting cards for features that still support
cards; report targets remain restricted to projects and milestones as recorded
in ADR-038. A report with kind `blocker` remains a report kind and does not
reintroduce card blocking metadata.

Calendar items expose card schedules and milestone due dates. The Gantt
response retains card and milestone rows, including unscheduled cards, with
pagination and warnings. It has no dependency edges, forecast analysis or
forecast rows. Gantt interactions move
or resize a card's recorded schedule and do not infer dates for another card.

## Compatibility and cleanup

The owner authorized conditional server writes for the registered cards before
strict validation. The cleanup preserved source bodies, schedules and retained
metadata while removing the obsolete dependency arrays. No source migration
framework or direct source-file write was introduced. Existing milestone due
dates are represented with `{date}` and no due kind. The two live projects
contained no milestone documents or card due/review dates to convert.

The retired forecast fixture remains available in the immutable pre-change
revision [`e1e022e53cace6e00e3725bdc44730c5df9b3a97`](https://github.com/Maciej1kti/astra/blob/e1e022e53cace6e00e3725bdc44730c5df9b3a97/examples/gantt-forecast.json).

## Consequences

Clients express card intent through lifecycle status, checklist, labels,
description and schedule. Reports remain scoped to projects and milestones.
A schedule is the only card date range and is the source for card date based
attention. Milestone due dates remain commitments. Clients
must not send the removed card fields or depend on Gantt dependency and forecast
projections.
