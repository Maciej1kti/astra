# Focus layout — 2026-09-22

## Change

Remove the introductory Focus copy and the In motion / Needs a look / On the
horizon counters. Show In focus, Needs my attention and In motion in order.
Pinned cards retain attention badges; remaining sections avoid repeating cards.
The active-card collection uses bounded pages and status filtering. The title
filter continues to apply to loaded titles.

Focus attention already uses card schedule End and Review status. Separate
milestone resources still exist, but the retired horizon counter was their only
consumer in Focus. Removing it also removes that collection read. Project and
milestone decision reports remain part of the shared attention projection.

The owner clarified that only Add card should float at the lower right. It
continues to open the existing centered autosaving editor for a selected project.

## Verification

- Full local gate passes: 209 Rust, 97 JavaScript and 12 Python tests,
  contracts/examples, frontend typing, boundaries, formatting, Clippy, release
  build and bundle budget. Rust tests run serially; the desktop portal test
  remains explicitly ignored. The first gate stopped on smoke-test formatting;
  `check-final.log` records the complete passing run.
- Five relevant release browser suites pass: Focus, dialogs, protocol, editor
  and autosave. Focus covers section order, duplicate suppression, grouped and
  pinned attention reasons, active cards without dates, project/title filters,
  bounded active reads without milestone reads, floating action placement at
  1440, 390 and 320 pixels, centered creation, Escape/focus restoration and one
  durable autosaved creation in the selected project.
- The broad smoke initially lost keyboard focus in the Board ordering scenario.
  Its previous quick-create composer remained open and restores input focus when
  the column refreshes. The smoke now closes that composer before beginning the
  independent keyboard-ordering scenario, retaining the durable-order assertion.
  This is test setup isolation, not a claim that Board preserves keyboard focus
  across refreshes while a quick-create composer is open.
- The complete broad HTTPS smoke passes after that setup correction
  (`smoke-verified.log`). Desktop and 320-pixel Focus screenshots were reviewed;
  the focused visual rerun passes all five scenarios. There are no page errors.

## Existing runtime

The existing manual host serves the verified release asset byte-for-byte. The
two projects, five cards and 26 existing reports keep their source versions;
the ordered focus resource is unchanged. Instance ID and command epoch are
preserved. Both projects validate cleanly, and doctor is ready with no issues
or pending commands. No synthetic project was recreated. A result report was
appended after those comparisons through the explicit-project CLI:
`076df0dc-0c20-407f-ba5d-c0ae26484c92`.

Evidence belongs in ignored `test-results/focus-layout-2026-09-22/`. No user
cards or focus selections are changed as part of synthetic verification.
Environment: Linux, Rust 1.98.1 via `scripts/cargo-local` (pinned 1.92 unavailable),
Node 24.11.0, Python 3.14.7 and Chromium 153.0.8010.52. Browser viewport emulation
does not establish physical iPhone/Safari acceptance or full release acceptance.
