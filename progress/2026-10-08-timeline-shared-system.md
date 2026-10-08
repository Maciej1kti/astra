# Timeline on the shared system — 2026-10-08

After the [Timeline was rebuilt](2026-10-08-timeline-redesign.md) the owner
asked that every element be a component of the current style, change with
every appearance and layout choice in Settings, and that all views draw from
one pool so that they are consistent throughout.

## What the audit found in the new Timeline

- Its toolbar was a copy of the Calendar toolbar's markup and styles, and its
  scale switch a third drawing of a segmented control: Chart had one, Calendar
  another for the month display, and the Calendar layout was a select.
- Bars were coloured by status with their own height, while the same card in
  Calendar is drawn by kind with `--calendar-chip-height`. A milestone was a
  diamond here and a flagged chip there.
- Row and header heights were taken from spacing steps in a way that made a
  bar thinner in the roomy spacing and let header text collide in the compact
  one.
- The cards without dates, the jump arrows, pagination and reload were bare
  buttons with local styling rather than the shared `Button`, and the heading
  a local one rather than `SectionHeading`.
- The press feedback in `styles/motion.css` named the Calendar toolbar only,
  so the Timeline toolbar's buttons had none.

## What changed

- `lib/ui/Segments` (moved from the Chart) is the one segmented control: Chart
  range, grouping and totals, the Calendar layout, the Calendar month display
  and the Timeline scale. The Calendar layout is therefore segments instead of
  a select.
- `lib/ui/PeriodToolbar` is the one toolbar for a view laid out over time.
  Calendar and Timeline render it and differ only in the controls they pass.
- A Timeline bar is drawn from the tokens a Calendar item uses: fill, rule and
  symbol by kind, the same height, rule width and corner. Status colours are
  gone; a milestone is a flagged chip. Weekends use `--wash` as in Calendar.
- A row is the bar plus spacing, and header tiers are their text plus spacing,
  so Zwarte and Przestronne change the room and never the bar or the text.
- The tray uses `SectionHeading` with its count and action, and `Button` for
  each card; the other controls use `Button` as well.
- The [design system](../docs/DESIGN-SYSTEM.md#timeline) names the two shared
  components under Ownership and describes what the Timeline takes from where.

## Checks

On macOS, against the real daemon:

- The `timeline` suite now compares a resting bar with what the tokens resolve
  to (fill, rule, height, corner) and a row with the bar plus spacing, in the
  default set and again with the technical character, the chalk palette and
  the roomy spacing: the corner changes, the row grows and the bar keeps its
  height. It also requires the shared toolbar, segments, heading and buttons.
- Captures of the Timeline and Calendar in the default set, technical with
  chalk and compact, editorial with paper and roomy, soft with cocoa in the
  dark, and at 390px, were inspected.
- The full local gate, the complete Chromium run, and WebKit for `timeline`,
  `planning`, `calendar-motion`, `calendar-pages`, `calendar-layout`,
  `calendar-popup`, `events`, `charts`, `localization` and `appearance`.
- The initial download is 81,662 of 81,920 bytes.

## Limits

- This pass covered Timeline and what it shares with Calendar and Chart. The
  other views were not audited for elements drawn outside the shared pool; the
  remaining selects in List filters and dialogs are form fields and were left.
- On a phone in the month layout the Calendar's month display sits on its own
  short row under the layout segments; with the select the two shared a row.
- Status is not shown on a bar. Showing it in both planning views needs the
  status in the calendar projection, which is a contract change.
- Not checked on a physical phone.
