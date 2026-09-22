# Compact checklist and card report removal — 2026-09-22

## Owner decision

The card editor uses a plain Checklist with a single row per item: checkbox,
text, remove icon and drag handle. Explanatory prose, per-row counters and arrow
buttons are removed; new entries use Add item. Existing checklist identities,
completion values, ordered storage and autosave remain supported.

Record progress, Card updates and Additional fields are removed from the card
editor with their draft state, locks, API helpers and components. The owner
explicitly confirmed removing card-targeted reports throughout the application.
Project and milestone reports remain. Card source metadata has a closed field
set, with no custom extensions.

## Existing data

The two registered projects were read through the CLI, including archived cards.
All five cards have no `x-*` fields and neither project has a card-targeted report.
There are therefore no matching live fields or report files to delete. All existing source versions were identical before and after updating the manual
runtime: two projects, five cards and 24 project reports. No project or card
content was rewritten. Both projects validate cleanly, and doctor reports ready
with no issues or pending commands. Instance identity and command epoch are
unchanged. The served JavaScript asset matches the verified build byte-for-byte.

## Verification

- Full `scripts/check.py` gate passes: 218 Rust, 94 JavaScript and 12 Python
  tests, contracts/examples, frontend typing, boundaries, formatting, Clippy,
  production build and bundle budget. Final Rust run uses `RUST_TEST_THREADS=1`.
- All ten release browser suites pass across `browser/` and `browser-final/`.
  The latter reruns the complete card and command-outcome suites. The broad
  HTTPS browser smoke also passes. There are no page errors or CSP violations.
- Card coverage includes one durable write per completed pointer/keyboard move,
  stable IDs/text/completion after reload, Escape without a write, long-list
  dialog auto-scroll, touch ordering and a single-row layout at 390 pixels.
  Desktop and mobile screenshots were inspected.
- Source/API/CLI checks reject card report targets and card extensions; positive
  project/milestone report coverage and milestone extension round-trips remain.
  Opening the card editor issues no report requests.

The first browser run exposed lost pointer capture when a keyed row moved.
Capture now belongs to the stable list, and the corrected pointer, touch and
long-scroll regressions pass. Keyboard cancellation restores grip focus.
The initial CLI regression expected the wrong local error code; it now checks
`CLIENT_ERROR`, the precise target error and absence of a mutation request.

A parallel Rust run hit `WouldBlock` while reopening the state journal in an
existing durability test. The full serial gate passes without changing locks or
durability behavior. One initial lost-response browser assertion timed out; its
complete suite passes on the final build without changing command recovery.
These initial failures and successful reruns remain in the ignored evidence.

Environment: Linux, Rust 1.98.1 through `scripts/cargo-local` (the pinned 1.92
was unavailable), Node 24.11.0, Python 3.14.7 and local Chromium 153.0.8010.52.
Evidence: ignored `test-results/card-checklist-2026-09-22/`, including `check.log`,
`browser/`, `browser-final/`, `smoke/`, source-version inventories and live checks.
Chromium viewport/touch emulation does not establish physical iPhone or Safari
acceptance; no remote CI or final release acceptance is claimed.

A short project report was appended through the explicit-project CLI:
`8ce0b8cf-ac89-44a7-82f9-3eea667ca37e`.
