# Interface refinement after the visual review — 2026-10-06

The owner asked for every finding of the
[visual review](2026-10-06-ui-review.md) to be corrected. This record lists what
changed, what was deliberately left alone and how it was checked.

## What changed

**Visible defects.** Board and Projects column titles keep their Polish casing;
the schedule trigger and the card title show a whole focus ring; compact
Timeline labels clamp to two whole lines; phone section counts stay on one
line; settings actions sit on the baseline of their fields and the timezone
hint follows its field; a disabled primary action is flat; date ranges read as
`7–9 wrz`; the card-project chooser is a small dialog with its label above the
field.

**Motion.** Eleven durations became three (120, 200 and 280 ms) plus a 160 ms
exit. A view fades once; a dialog and a menu arrive as one surface. The
scripted cascades (`revealScene`, `revealLayers`, calendar layers), per-card
layers, heading blur and decorative responses (icon scale and rotation,
checkbox squeeze, row shift, arrow nudge, card lift) are removed. The moving
navigation selection, press feedback, save and tag confirmation and disclosure
height remain.

**One card and one board dialect.** `ResourceMetadata` now matches Focus pins:
a flag for high priority, a calendar icon with a short date, a check with the
checklist total and quiet tags. Dates and times use the interface face. The
project Board uses the same soft panels and cards as Projects and the
all-project Board.

**Fewer controls.** Calendar has one create action, which plans the card on
the day shown. The project Board adds cards from its column footers only, and
on a phone the status strip replaces the column header. Timeline keeps scale
and selection in one row. List drops its table header and names the project
only when it spans projects. Reports show an icon for their kind. The header
names a profile only when it is not the default one, and on desktop **Więcej**
no longer repeats the sidebar. Counters offer a labelled Add button, with the
menu only once a counter is archived. Tag chips are small labels inside full
touch targets. Cancel is the quiet action in every dialog. The pairing screen
loses its eyebrow line.

**Tokens.** Each colour is written once with `light-dark()`, so the second
palette block is gone and dark shadows have weight. The type scale has six
sizes instead of eleven. Viewport breakpoints are 1100, 700, 640, 520, 420 and
360px. Raw dimensions, layers, opacities and motion literals became tokens or
named component properties. Text glyphs used as icons were replaced by the
icon set, a chevron pair and one disclosure marker. The primary action is flat.

## Deliberately unchanged

- **Spacing token names.** Renaming `--space-1…20` to size-based names changes
  nothing on screen and rewrites about a thousand lines, which would conflict
  with any parallel style work. It is better done alone.
- **Sections of a new card.** Hiding Counters and Comments until the card
  exists would insert them under the pointer when autosave creates the card.
- **Empty Chart controls.** The range and grouping controls stay, because a
  different range can be what reveals a counter.
- **Typed date fields beside Wybierz daty** and the dialog backdrop blur
  remain as documented.
- **The floating add button on phone Focus** still overlaps the last visible
  row beside the dock; moving it is a layout decision for the owner.
- **Existing single-use dimension tokens** stay in `tokens.css`; the guide now
  states where a new one belongs.

## Verification

Release build in an isolated worktree, real daemon, disposable synthetic hosts
with ordinary pairing.

- New `style-rules` unit test fails on a raw colour, dimension, duration,
  layer, partial opacity, easing or type value outside `tokens.css`, on a
  viewport breakpoint outside the list, on a second palette block, on more
  motion durations or type sizes, and on a text glyph used as an icon.
- New unit test for `formatCivilDate`/`formatCivilRange`.
- The `motion` suite was rewritten for the new vocabulary: no scripted
  animation on loaded content, no delay or blur, a view within 200 ms, a
  dialog within 280 ms and a menu within 120 ms, each readable halfway. The
  `calendar-motion` suite and the card-layer checks were retired with the
  layers they tested.
- Suites that read changed text or controls were updated: `card`, `dialogs`,
  `counters`, `planning`, `command-recovery`, `calendar-layout` and the HTTPS
  smoke.
- `scripts/check.py` passes: 461 JavaScript unit tests, the Rust workspace
  tests, types, lint, formatting and the bundle budget at 78,273 of 81,920
  gzip bytes (80,449 before).
- Chromium: all 39 regression suites, the HTTPS smoke, the planning chain and
  the CLI tag workflow pass on the final build.
- WebKit: 38 of 39 suites pass. `responsive` fails on the header project
  picker's 23px height at 320px, the same assertion recorded as failing on the
  unmodified tree on 2026-10-05. `motion`, `navigation`, `dialogs`, `card` and
  `ui-corrections` were run again on the final build and pass.
- Rendered results were inspected at 1440, 820 and 390px in light and dark:
  all eight views, Calendar day/week/agenda, the card editor with its menus,
  schedule dialog, settings, registration, report and pairing.

## Limits

Chromium and Playwright WebKit on macOS; phone and tablet sizes are emulated,
not physical devices. `light-dark()` needs Chrome/Edge 123, Firefox 120 or
Safari 17.5. Whether the calmer motion and the merged controls are accepted is
the owner's decision.
