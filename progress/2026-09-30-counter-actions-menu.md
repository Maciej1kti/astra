# Counter actions menu

Date: 2026-09-30. Owner-requested follow-up. Baseline: `f7f1914`.

One right-aligned three-dot button below the counters now contains Add counter
and Archived. The standalone actions are removed. Archived retains its toggle
state and is disabled when there are no archived counters. Adding a counter
closes the menu and focuses its configuration name. Existing draft, history,
configuration and conditional-write behavior remain intact.

The shared ActionMenu has an opt-in automatic placement inside the dialog scroll
surface. It opens above/below, or beside the trigger on short screens so both
actions remain visible. Existing menu placement defaults, Escape/focus behavior,
motion tokens and reduced-motion handling remain available.

Verification on macOS arm64, Node 24.11, release builds:

- Final full gate passes 251 Rust, 137 JavaScript and 12 Python tests, with zero
  Svelte errors/warnings and passing schema, format, boundary, bundle and Clippy checks.
- Four final Chromium suites pass: `counters`, `card-layout`, `editor-header`,
  `dialogs`. Three final WebKit suites pass: `counters`, `card-layout`, `editor-header`.
- Each engine passes 24 menu geometry cases: empty/populated counters, first/last
  section, widths 320, 390, 768, 1024 and 1440px, plus 844 × 390 landscape. Both
  actions fit the scroll surface; Escape restores trigger focus, menu choices
  close the menu, Add focuses the name, and archive filtering leaves source
  versions unchanged. Light/dark and short-screen screenshots were reviewed.
- Rebuilt the embedded frontend/release daemon and restarted the existing manual
  app at `https://100.122.250.14:47832`. Trusted HTTPS verifies all 33 build assets
  byte-for-byte. All 37 prior resource versions, two pins, preferences and the
  certificate are preserved.

Commands: `.venv-check/bin/python scripts/check.py` and release browser suites
through `scripts/browser/regressions.mjs`. Logs, screenshots, geometry and restart
snapshots are in ignored `test-results/counter-actions-menu/`. Browser checks do
not establish physical-device or full release acceptance.
