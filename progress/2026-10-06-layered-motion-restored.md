# Layered motion restored — 2026-10-06

The [interface refinement](2026-10-06-ui-refinement.md) replaced the layered
entrances with single short fades. The owner then asked for them back:
elements are meant to appear softly and in layers, each with its own curve.
Removing them had been a wrong reading of "minimalism", which concerned
layout, controls and visual noise.

## What changed

- `revealScene`, `revealLayers` and the Calendar layers are back with their
  original structure and timing: surface, heading, sections and details in a
  dialog; headings, rows and inner card layers in a view; menu, suggestion and
  toolbar layers; the blur on small heading layers; the three curves
  `--motion-emerge`, `--motion-ease` and `--motion-spring`.
- Press, hover lift, navigation icon, pin, priority, checkbox, row and
  confirmation responses are back as before.
- The values the stylesheet previously wrote as literals are now tokens with
  the same values (`--motion-dialog-distance`, `--motion-scale`,
  `--motion-press`, `--motion-press-in`, `--motion-popup-heading`,
  `--motion-popup-content`), so the `style-rules` guard still holds.
- Everything else from the refinement stays: the corrected defects, the shared
  card and board dialects, the merged controls, the single palette definition,
  the type scale and the breakpoints.

Two adjustments follow from the refinement's layout changes. The Timeline's
control layer now covers its single control row. A project-scoped List row has
no project line, so its card layers are title, metadata and labels; the
cross-project List keeps the context layer, and the card-layer scenario checks
both.

## Verification

Release build in an isolated worktree, real daemon, disposable synthetic hosts.

- The original `motion` and `calendar-motion` suites and the card-layer
  scenarios are restored and pass in Chromium and WebKit.
- `scripts/check.py` passes, with 461 JavaScript unit tests and the bundle at
  80,914 of 81,920 gzip bytes.
- Chromium: all 40 regression suites, the HTTPS smoke, the planning chain and
  the CLI tag workflow pass.
- WebKit: `motion`, `calendar-motion`, `navigation`, `dialogs`, `menus`,
  `card`, `card-layout`, `focus-controls` and `projects` pass. The other
  suites were not run again in WebKit for this change.
- Paused frames of the card dialog and the Focus view show the title, sections
  and card layers arriving in sequence again.

## Limits

Browser checks on macOS, not a physical device or a frame-rate measurement.
The layer delays in `motion.ts` and `motion-layers.ts` remain numbers in code,
as documented in the design guide. Any change to this vocabulary needs the
owner's agreement first.
