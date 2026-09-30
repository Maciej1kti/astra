# Compact card counters

Date: 2026-09-30. Owner-requested follow-up to the card modal and Focus controls.
Baseline: `16a6935`.

Counters now share a compact divided list with a value control and a 14-day
mini chart. Tapping the name/chart expands the complete saved history. Missing
days remain distinct from saved zero; the chart shows acknowledged values only.
The repeated current date, time and timezone line is removed. Full dates remain
in history and in the necessary warning for a draft belonging to a previous day.

Horizontal scrubbing uses the existing Focus gesture action and configured step;
vertical movement scrolls the card. Tapping the value opens numeric entry, with
keyboard support. Save/Cancel appear only while editing. Incomplete or invalid
input remains an editor-owned draft through section reordering, ordinary card
autosave, session loss and midnight. Only acknowledged counter commands clear
the submitted draft; explicit confirmation, request identity and conflicts retain
their existing behavior. Configuration, hidden counters and restore remain available.
No API or source-format change was needed.

Verification on macOS arm64, Node 24.11, release builds:

- Full local gate: 251 Rust, 133 JavaScript and 12 Python tests; schemas,
  generated contracts, Svelte, boundaries, format, Clippy and bundle checks pass.
- Eight Chromium suites pass: `counters`, `editor-header`, `editor-inputs`,
  `card-calendar`, `session`, `card-layout`, `focus-controls`, `editor`.
- Five WebKit suites pass: `counters`, `editor-header`, `card-calendar`,
  `session`, `card-layout`.
- Browser coverage includes horizontal drag, real Chromium touch events,
  vertical scrolling, pointer cancellation, keyboard increments, numeric bounds,
  explicit confirmation, preserved drafts, full history, session recovery,
  uncertain writes, conflicts and the counter's original day at midnight.
- Visual review uses the real release UI and synthetic saved histories at
  1440, 1024, 768, 390 and 320px, plus 844 × 390 landscape. Light/dark appearance,
  expanded history and the maximum numeric value at 320px fit without horizontal
  overflow. Three ordinary idle rows measure 80.5–87.5px each across these views;
  this is fixture geometry, not a measured percentage improvement.

Numeric-entry coverage exposed programmatic scrolling of the outer dialog,
which hid its persistent header. The card shell now clips overflow while its form
remains scrollable. Chromium and WebKit regressions verify that the shell stays
at scroll position zero and the close control remains visible. Initial locator
and header failures were corrected before the final passing runs.

The embedded frontend and release daemon were rebuilt, and the existing manual
application restarted at `https://100.122.250.14:47832`. Trusted-certificate HTTPS
checks verify all 33 served build assets byte-for-byte. All 33 pre-existing
resource versions, two pins, workspace preferences and certificate match the
pre-restart snapshot.

Commands and artifacts: `.venv-check/bin/python scripts/check.py`;
`ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs <suites>`;
WebKit uses `ASTRA_TEST_BROWSER=webkit`. Logs, screenshots, geometry and restart
snapshots are under ignored `test-results/compact-counters/`. Browser emulation
does not establish physical phone/tablet acceptance; full release acceptance
remains open.
