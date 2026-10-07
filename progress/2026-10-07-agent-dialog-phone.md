# Agent dialog on a phone — 2026-10-07

The owner reported, from an iPhone 12 Pro web app, that the Agent dialog looked
angular and outside the component system, and that its upper edge touched the
top bar once opened.

## Finding

The dialog focuses its composer when it opens, so the phone raises the keyboard
at once. The keyboard fit (`data-keyboard`) then set `border-radius: 0` and
placed the dialog at the top of the visible area with no gap. Measured at
390 × 844 with a 336px scripted keyboard: top 0px, radius 0px. Without a
keyboard the dialog matched the other dialogs. The composer was a bare textarea
beside a text button, with the offset focus ring around a permanently focused
field.

## What changed

- Fitted above the keyboard, the dialog keeps its radius and an 8px gap on every
  side, below the top safe area.
- At 520px and narrower it starts below the top safe area and ends above the
  home indicator, as the dock does, instead of padding its footer.
- The composer is one field holding a borderless textarea and an icon-only
  **Wyślij** button with concentric corners; the focus ring hugs the field. The
  owner's messages use the card radius.
- The [design system](../docs/DESIGN-SYSTEM.md#floating-actions-and-the-agent-dialog)
  and [user guide](../docs/USER-GUIDE.md#use-the-agent) describe this.

## Checks

Release build, on macOS:

- `agent` in Chromium and WebKit, including a new check that scripts the visible
  height and requires the same radius and 8px gaps above the keyboard;
  `dialog-components` in both engines.
- `npm run check`, `npm run lint`, `npm run format:check`, `npm run check:bundle`.
  The initial bundle is exactly at its 81,920-byte budget, so the send button
  reuses the shared `arrow` icon instead of adding one.
- Rendered screenshots at 390 × 844 with touch, light and dark, with and without
  47/34px safe-area insets (Chromium), and at 1440px.

The full gate was not run for this contained interface fix. The keyboard and
safe areas were emulated; no engine here raises a real iOS keyboard, so the
result on the physical iPhone is the owner's to confirm.
