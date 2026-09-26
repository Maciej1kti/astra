# Daily Focus sections — 2026-09-26

Focus now orders In focus, Needs my attention, In motion and Events. Source pins
remain visible regardless of card status, archive state or dates. In motion uses
inclusive date schedules containing today in the workspace timezone, including
Planned cards; undated and future cards are excluded. Events contains today's
unfinished timed cards in start-time order. Ended events move to attention.

Focus attention includes overdue items, review cards, unresolved decisions and
unread reports, without due-soon reminders. Reading a normal report clears its
reminder; reading a decision does not resolve it. Pin precedence and attention
badges are retained. Daily queries filter before pagination, with independent
plan/event cursors and visible-minute refresh. See ADR-048 and its HTTP examples.

Verification on macOS ARM64:

- Full `.venv-check/bin/python scripts/check.py` passes: contracts/examples,
  OpenAPI, 12 Python tests, 106 JavaScript tests, frontend typing/boundaries,
  formatting, bundle budget, Clippy, 230 Rust tests and release builds.
- Focus, events, protocol and dialogs release Chromium suites pass. Focus covers
  four-section membership, Planned/date behavior, event separation, archive/done
  pin visibility, report read state, folder filters, conditional pin ordering,
  conflicts and unchanged uncertain-command retries. Layout checks cover
  320, 390 and 1440px; the desktop screenshot was visually reviewed.
- Deterministic server tests cover Warsaw midnight while UTC is the prior day,
  inclusive schedule bounds, status/date exclusions, folders before paging,
  minute/section cursor expiry, event ordering/end and report receipts.
- Initial new-test failures were corrected: report creation returns HTTP 200;
  resolution reports need an exact original-decision title selector; archive is
  applied as a conditional patch after card creation. No guard was weakened.

Artifacts: ignored `test-results/focus-daily/` and `test-results/focus-daily-rerun/`.
The initial Focus run failed the two browser fixtures above; the corrected Focus
rerun passes. Events, protocol and dialogs passed in the first run.

The embedded frontend and release daemon were rebuilt and the existing manual
launcher restarted at `https://100.122.250.14:47832`. Certificate-verified HTTPS
serves the new frontend. All 11 pre-existing source resource versions, two pins
and the certificate were preserved across restart. Both projects validate with
zero invalid sources. The live In motion read contains the current date plan;
Events is empty because no matching live event is scheduled. A separate result
report is appended through projectctl after verification.

Chromium viewport checks do not establish physical iPhone/Safari acceptance.
No source schedule, card status, project scope or acceptance status was changed.
