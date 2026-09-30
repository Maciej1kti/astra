# Pinned Focus cards and card calendar

The owner requested clearer pinned cards, compact counters usable directly in
Focus, and a polished card date picker across phone, tablet and desktop widths.

Pinned cards now separate project/status, title, quiet metadata and a daily
counter strip. Long counter names wrap. Horizontal scrubbing changes a local
total in the configured step; arrow keys and direct numeric entry are also
available. Save confirms the total. The route-independent draft retains its
original date/version across refresh, midnight, navigation and session loss.
Uncertain writes preserve their command identity; conflicts require explicit
discard/refresh. Archived pinned cards retain the same counter-editing capability
as their full editor, while hidden counters stay hidden.

The Focus snapshot includes bounded current-day previews without individual card
reads, bodies or historical totals. The existing conditional counter write is
unchanged. OpenAPI, generated types, examples and
[ADR-053](../docs/ADR-053-FOCUS-DAILY-COUNTER-PREVIEWS.md) describe the observed
preview version and older-host/unverified-source behavior.

Choose dates opens a native modal with a range calendar, workspace week start,
today/clear shortcuts, keyboard month/year navigation and 44px day targets.
Apply updates the existing editor draft/autosave; Cancel/Escape discards only the
picker proposal and returns focus. Timed cards keep time and duration. Shared
colors, buttons, icons and reduced-motion-aware transitions support both themes.
Native typed date/time controls remain available.

## Verification

- Full local gate passes: 251 Rust, 125 JavaScript and 12 Python tests; schema,
  OpenAPI, examples, generated contracts, Svelte, boundaries, formatting, Clippy,
  bundle budget and release build also pass.
- Fourteen affected release Chromium suites pass across the change: Focus,
  focus-controls, card-calendar, card-layout, counters, editor-inputs,
  editor-header, loading, session, editor, autosave, events, protocol and
  command-outcomes. Five WebKit suites pass: focus-controls, card-calendar,
  Focus, counters and card-layout. The new control suites were rerun after the
  final gesture, focus-restoration and archive-compatibility fixes.
- Visual checks cover 1440, 1024, 768, 390 and 320px, light/dark appearance and a
  short landscape calendar. Browser regressions verify conditional/replayed
  writes, no initial per-pin card reads, local-only calendar exploration, Sunday
  week start, range/event application, keyboard navigation and nested dismissal.
- Chromium touch input reproduces and protects implicit capture transfer from a
  tapped digit to its button. A bubbling child capture-loss event must not cancel
  the scrub. Completed, cancelled and Escape-aborted touch gestures pass.
  WebKit explicitly focuses the calendar trigger before opening so cancellation
  restores the correct control. Nested calendar footers no longer inherit the
  editor form's negative margins.
- These are desktop browser engines and emulated viewports/touch input, not a
  physical iPhone or iPad test. Full product release acceptance remains open.

Evidence is in ignored `test-results/focus-calendar/`: `gate-verified.log`,
`chromium-fix2`, `chromium-final`, `chromium-verified`, `webkit-final`,
`webkit-verified`, `final-chromium-controls` and `final-webkit-controls`.
Earlier failed runs remain alongside the passing reruns with their diagnostics.

## Manual application

The embedded frontend and release daemon were rebuilt. The existing launcher was
restarted with its original data directory, origin, ports and certificate.
`https://100.122.250.14:47832` responds over verified HTTPS, and all 33 public
assets match the build byte for byte. Before/after snapshots preserve 30 resource
versions, both pins and their order, preferences and the certificate. The result
report is appended afterward; existing card source edits are excluded from this
change. Snapshot and asset hashes remain in the ignored evidence directory.
