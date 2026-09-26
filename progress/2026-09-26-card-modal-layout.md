# Card modal layout — 2026-09-26

The card header now has two rows. The first contains a status-icon disclosure,
the single editable title and Close. The second contains project context, a
High priority toggle, autosave state, pin and card actions. Mobile uses the flag
icon for the priority toggle while keeping its accessible name and pressed state.
Status choices have distinct icons and save immediately through existing autosave.
The header title stays visible during body scrolling and has a three-line bound.

Planning dates remain first in the body; the date-only helper sentence is removed.
Checklist is a peer of Description without an inset panel. The label-entry helper
line is removed. Comments start with Write a comment and Add comment, followed by
saved history. Browser comments always submit human/Owner attribution, with no
author fields or redundant New comment/Markdown helper text. Existing human/bot
history and CLI/API attribution remain unchanged. No source contract changed.

Verification on macOS ARM64:

- Full `.venv-check/bin/python scripts/check.py` passes: contracts/examples,
  OpenAPI, 12 Python tests, 106 JavaScript tests, Svelte with zero diagnostics,
  import boundaries, formatting, bundle budget, Clippy, 230 Rust tests and release
  frontend/daemon builds.
- Ten release Chromium suites pass: editor-inputs, comments, card, editor,
  autosave, tags, dialogs, focus, responsive and events. The broad HTTPS browser
  smoke also passes. Updated tests cover all five status icons and writes,
  disclosure keyboard dismissal, priority on/off persistence, the header title,
  absence of removed fields, Owner attribution and composer-before-history order.
- Existing tests retain coverage for comment/field conflicts, unchanged retry
  identities, autosave serialization, close flushing, checklist dragging and
  tags. Card and autosave initially failed obsolete DOM expectations for the
  old header; their corrected selectors and title location pass on rerun.
- Header/date geometry is checked at 320, 390, 430, 768, 1024 and 1440px.
  Screenshots at 320, 390 and 1440px were visually reviewed in light/dark themes.
  Chromium viewport emulation does not establish physical iPhone acceptance.

Ignored artifacts: `test-results/card-modal/`, `test-results/card-modal-rerun/`
and `test-results/card-modal-smoke/`. Final application code passed the full gate;
the subsequent changes update obsolete browser selectors only.

The existing manual application was restarted at `https://100.122.250.14:47832`.
Certificate-verified HTTPS serves the rebuilt card header. All 13 pre-existing
source resource versions, two pins and the certificate are unchanged across
restart, and both projects validate with zero issues. A short result report is
added through projectctl after verification. The owner's pre-existing card edits
are preserved separately from this implementation commit.
