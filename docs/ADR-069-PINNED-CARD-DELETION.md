# ADR-069 — A pinned card is deleted in one command

Status: accepted on the owner's 2026-10-06 direction.

`DELETE /api/v1/projects/{project_id}/cards/{card_id}` refused a card whose
source had `pinned: true` with `409 CARD_IN_FOCUS`. The rule dates from
workspace-owned Focus references, where deleting a card could leave a reference
behind. Since [ADR-041](ADR-041-SOURCE-BACKED-FOCUS-AND-TAGS.md) the pin is a
field of the card's own source, so the refusal protected nothing and cost the
owner three steps: unpin, reopen the card, delete.

## Decision

Card deletion no longer inspects the pin.

- The command is unchanged: the observed version, an empty payload, the same
  request ID and epoch on a retry. The observed version already covers the pin,
  so a card pinned or unpinned since it was read is a `412 VERSION_CONFLICT`.
- Focus membership is the set of cards with `pinned: true`, so the deleted card
  leaves Focus with its source for every profile that registers the project.
- `workspace.focus` is not rewritten. It only ranks cards that are still
  pinned; an entry for a deleted card ranks nothing, exactly as an entry for an
  unpinned card already does. A later order write replaces it.
- `CARD_IN_FOCUS` is no longer returned. A journaled rejection recorded before
  this change still replays its original reply for the same request ID.
- An interrupted deletion of a card is always recoverable by the next writer or
  at startup; the reference recheck remains for reports.

The browser asks for the same confirmations as for any card and no longer
carries a message or conflict handling for the removed code.

## Consequences

Deleting a pinned card needs one confirmed action. There is still no trash or
restore; the confirmation and the conditional version are the only guards.
Report deletion keeps its `REPORT_REFERENCED` refusal.
