# One-step deletion of a pinned card — 2026-10-06

After [the touch fix](2026-10-06-touch-menu-actions.md) a card pinned to Focus
was still refused with `409 CARD_IN_FOCUS`. The owner decided that deletion
must work in one step for pinned cards too.

## What changed

- The server no longer inspects the pin when deleting a card. The pin is a
  field of the removed source, so the card leaves Focus with it;
  `workspace.focus` only ranks cards that are still pinned and is not
  rewritten. The conditional version, empty payload, replay and recovery rules
  are unchanged. [ADR-069](../docs/ADR-069-PINNED-CARD-DELETION.md) records the
  decision.
- `CARD_IN_FOCUS` is no longer returned; the browser drops its message and
  conflict handling.
- OpenAPI and its generated representations, the user guide, the CLI guide and
  ADR-041 describe the new rule.

## Verification

- The engine regression `pinned_card_delete_removes_it_from_focus_in_one_command`
  pins two cards, ranks the doomed one first in the local order, deletes it
  with one command and expects a complete Focus resource holding only the other
  card. It failed with `409 CARD_IN_FOCUS` before the change.
- `scripts/check.py`: all 16 steps pass, including 389 Rust tests and 456 Node
  tests.
- Chromium, release daemon, disposable hosts: `deletion`, `focus`,
  `focus-controls`, `editor`, `card`, `command-outcomes`, `command-recovery`,
  `protocol`, `localization` pass. The new `deletion` check `D01-pinned` pins a
  card, deletes it from its editor, and expects the source file, the Focus
  view entry and the Focus membership to be gone.
- WebKit: `deletion` and `focus` pass.

## Limits

No physical iPhone was used. The owner's own pinned card was not deleted by
these checks; all sources belonged to disposable hosts.
