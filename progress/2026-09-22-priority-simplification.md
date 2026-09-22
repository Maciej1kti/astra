# Card priorities and Focus footer — 2026-09-22

## Change

Cards now accept only Normal and High in source validation, create/patch/undo,
collection filters, schemas, generated types and browser controls. CLI commands
use the same server rules. Retired values are rejected; stale index summaries
cannot publish them. ADR-040 records compatibility and conditional conversion
rules. An inventory of both existing projects, including archived cards, found
all six cards already Normal, so no source conversion is needed.

The Focus workspace bar now follows its content as a footer. Other views keep
their header at the top; the decorative source-of-truth footer is removed.
The floating Add card action leaves footer controls reachable on narrow screens.
In motion continues to mean Active cards outside the visible focus/attention rows.

## Verification

The first gate passed all 212 Rust, 97 JavaScript and 12 Python tests, then its
release build overlapped a final frontend rebuild and referenced replaced asset
names. This was a local build sequencing error. The complete final gate passes
with frontend and daemon builds strictly sequential (`check-final.log`), including
the same test totals, schemas/examples, frontend typing, formatting, boundaries,
Clippy, release build and bundle budget. Rust tests run serially; the desktop
portal test remains explicitly ignored. No application rule or test assertion
was weakened.

- Four release browser suites pass: Focus, dialogs, editor and autosave. Coverage
  includes exact editor/filter options, durable Normal-to-High round trips,
  priority filtering across reload, High metadata badges, autosave conflicts and
  Focus section/action behavior. There are no page errors.
- Footer visual checks at 1440, 390 and 320 pixels confirm reachable controls,
  working settings/diagnostics dialogs and no horizontal overflow; other views
  keep their top header. See the Focus follow-up evidence for screenshots.

## Existing runtime

The existing manual host was restarted with the verified release build. Its
served JavaScript matches the build byte-for-byte. Both projects, all six cards
and 27 existing reports retain their source versions. The ordered Focus resource,
instance ID and command epoch are unchanged. Both projects validate cleanly;
doctor is ready with no issues or pending commands. No synthetic project was
recreated. After the comparisons, the explicit-project CLI appended result report
`8c46e675-7f38-4084-adcb-605af594cac5`.

Evidence: ignored `test-results/priority-simplification-2026-09-22/` and
`test-results/focus-footer-2026-09-22/`.

Environment: Linux, Rust 1.98.1 via `scripts/cargo-local` (pinned 1.92 unavailable),
Node 24.11.0, Python 3.14.7 and Chromium 153.0.8010.52. Browser viewport emulation
does not establish physical iPhone/Safari or full release acceptance.
