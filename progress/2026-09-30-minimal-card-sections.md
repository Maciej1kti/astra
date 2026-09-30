# Minimal card section chrome

Date: 2026-09-30. Owner-requested presentation follow-up. Baseline: `e7445e6`.

Card section names and heading counts are visually hidden through the shared
SectionHeading component, preserving accessible headings without empty layout
rows. Actions remain visible at the right edge. The schedule disclosure retains
its useful relative summary even when expanded; layout-menu section names and
input labels remain available.

Counters no longer show the gesture helper. Add counter stays at the right above
the list; the shorter Archived toggle aligns to the same edge below it, retaining
its show/hide behavior and exposing a pressed state. Gestures, numeric input,
history, explicit saves and ordinary card behavior are unchanged.

Verification on macOS arm64, Node 24.11, release builds:

- Full gate passes 251 Rust, 137 JavaScript and 12 Python tests, with zero Svelte
  errors/warnings and passing schema, format, boundary, bundle and Clippy checks.
- Six Chromium suites pass: `card-layout`, `counters`, `comments`, `card`, `tags`,
  `editor-inputs`. Four WebKit suites pass: `card-layout`, `counters`,
  `card-calendar`, `editor-header`.
- Reviewed real release screenshots at phone, tablet and desktop widths,
  including 320px, both themes and expanded archived counters. Geometry checks
  across 320, 390, 768, 1024 and 1440px plus 844 × 390 landscape verify matching
  action edges, 44px targets and no horizontal counter overflow. Toggling Archived
  leaves the source version unchanged.
- Rebuilt the embedded frontend/release daemon and restarted the existing manual
  app at `https://100.122.250.14:47832`. Trusted HTTPS verifies all 33 build assets
  byte-for-byte; all 35 prior resource versions, two pins, preferences and the
  certificate are preserved.

Commands: `.venv-check/bin/python scripts/check.py` and release browser suites
through `scripts/browser/regressions.mjs`. Logs, screenshots and restart snapshots
are in ignored `test-results/minimal-card-sections/`. Browser coverage does not
establish physical-device or full release acceptance.
