# Card layout handles and shared section visibility

Date: 2026-09-30. Owner-requested six-dot handles and per-card visibility on all
devices; browser-local section ordering remains a separate preference.

Card layout now uses the shared grip and button components for pointer/touch
dragging, with an insertion preview, cancellation, short-panel scrolling and
keyboard ordering. Eye buttons toggle each section for the current card. Hidden
sections retain mounted drafts and their stored content. Visible sections alone
determine spacing and dividers. A native popover keeps the controls reachable
even when all six sections are hidden; reduced motion is respected.

Optional card metadata `hidden_sections` uses ordinary conditional autosave,
validation, durability and replay. Omitted/empty values show all sections. Existing
sources remain valid without migration. Schemas, generated types, examples and
[ADR-056](../docs/ADR-056-CARD-SECTION-VISIBILITY.md) document the contract.
Domain/application regressions cover invalid values, retained content, replay,
stale versions, restart persistence and restoring visibility.

Release Chromium passes `card-layout`, `card-calendar`, `editor-inputs`, `editor`,
`focus-controls` and `counters`. WebKit passes the first three and `counters`;
broad HTTPS and planning suites also pass. Card layout checks independent paired
browser contexts, unaffected other cards, retained unfinished entries, all-hidden
recovery, mouse/keyboard ordering, Chromium touch cancellation, landscape
autoscroll, reduced motion and strict CSP at 320–1440px. Light/dark rendered phone,
tablet and desktop layouts were inspected. The gesture test now waits for Svelte's
scheduled FLIP animation before measuring the next handle, avoiding a reproduced
stale-coordinate selection in Chromium. Evidence is under ignored
`test-results/card-layout-controls/`.

On macOS arm64 / Node 24.11, the final full gate passes 257 Rust, 139 JavaScript
and 12 Python tests, including subprocess durability checks, frontend build and
release binaries. An earlier run encountered transient nonblocking socket reads
in the unchanged CLI query test harness; its isolated rerun and the final full
gate both pass. No production or test behavior was relaxed for that failure.

The rebuilt manual app at `https://100.122.250.14:47832` preserves all 49 prior
resource versions, two pins, preferences and certificate after restart. Trusted
HTTPS verifies all 33 served files against the build. The result report is added
after those comparisons.

These are desktop browser and touch-emulation results. Physical iPhone and full
release acceptance remain open.
