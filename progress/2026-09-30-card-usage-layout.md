# Card schedules and section order — 2026-09-30

The owner requested a compact everyday card view, editable section order and
smooth motion while retaining the expanded schedule controls during creation.

## Result

- Existing schedules occupy one disclosure row with relative time and the
  inclusive plan day. Timed events use the workspace civil clock; finished cards
  show planned duration without a growing overdue indicator. New card sessions
  keep date/time controls open through their first acknowledgement.
- The header layout menu reorders the four content sections and two property
  sections independently, with 44px keyboard/touch buttons and live movement.
  Keyed components preserve mounted controls and unfinished drafts. Tablets and
  phones stack properties after the content column, retaining DOM reading order.
- Only sanitized section identifiers persist in this browser. Reset restores
  defaults; unavailable storage leaves the current layout usable with an explicit
  message. Card sources and workspace/server preferences are unchanged.
- Schedule expansion and section movement follow reduced-motion preferences.
  Shared menu handling now preserves clicks when WebKit shifts focus to the
  dialog, and Escape closes the open menu before the editor.
- A reproduced local-validation issue is fixed: restoring the original valid
  dates clears stale “Not saved” feedback without sending a redundant command.
  Pending, rejected and uncertain command identities remain untouched.

## Verification

The final full gate passes 249 Rust, 119 JavaScript and 12 Python tests,
contracts/types, boundaries, formatting, Clippy, bundle checks and release build.
Seven new unit tests cover layout sanitization/storage and relative schedule
semantics, including inclusive dates, DST, workspace midnight and timed events.
An intermediate gate overlapped a frontend rebuild and failed on stale embedded
asset paths; the final gate ran without competing builds and passed.

Fourteen affected release Chromium suites pass. After the shared menu fix,
card-layout, editor-inputs, editor-header, tags and dialogs pass again. Seven
targeted WebKit suites pass across the verification runs: card-layout,
editor-inputs, editor-header, tags, comments, counters and autosave. The new layout
suite checks retained DOM/drafts, no presentation writes, keyboard-to-pointer
interaction, persistence/reset, creation state, reduced motion and strict CSP.
Visual review includes 320/390/768/1024/1440px, short landscape and dark appearance.
Environment: macOS 27 arm64, Node 24.11.0, Chromium 153, WebKit 26.6.

The broader WebKit dialogs suite still fails its screenshot-injected inline
stylesheet check and two settings/tag-manager focus assertions. All three were
reproduced using the previous verified frontend assets (`931079d`) against the
same synthetic host workflow; they are not reported as passes. Physical iPhone
and release acceptance remain open. Bulk output is ignored under
`test-results/card-usage/` and `test-results/card-modal/usage-final/`.

The embedded frontend and release daemon were rebuilt and the existing manual
application restarted. HTTPS serves all 33 public assets byte-for-byte from the
verified build. All 29 pre-existing resource versions, two pins, preferences,
certificate and the existing HTTPS origin are preserved across the restart.
