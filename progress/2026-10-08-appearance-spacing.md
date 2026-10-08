# Spacing as an appearance choice — 2026-10-08

After seeing the [appearance sets](2026-10-07-appearance-sets.md) the owner
asked for a choice of spacing as well.

## What changed

- **Ustawienia → Wygląd** has a fifth group, **Odstępy**: Astra (the default),
  Zwarte and Przestronne. It is chosen apart from the theme, palettes and
  character, kept in the browser like them, and loaded on demand with the same
  stylesheet.
- A spacing redeclares the `--space-*` scale: three quarters of the default for
  Zwarte, one and a quarter for Przestronne. The three smallest steps stay.
  Touch targets and control heights keep 44px. Up to 700px wide Przestronne
  grows by half as much.
- The check that marks a selected card moved from beside its name to the
  corner of its miniature, in every group. Beside the name it broke the two
  longest character names once the cards narrowed.
- The [design system](../docs/DESIGN-SYSTEM.md#appearance-sets) and
  [user guide](../docs/USER-GUIDE.md#appearance) describe it.

## Findings while checking

- At 320px the full Przestronne scale left an attention row in Focus about
  60px for its title. That is why phones get the gentler scale; with it a
  title of one long word can still break one letter early at 320px.
- No component needed a change: gaps and padding already came from the scale,
  and no view scrolled sideways in either new spacing.

## Checks

Release build, on macOS:

- `scripts/tests/appearance.test.mjs`: every spacing names the complete scale
  in ascending order and has a menu entry, `tokens.css` equals the default
  block, the phone scale lies between the default and the full one, and a
  stored spacing alone requests the sets stylesheet.
- The `appearance` browser suite in Chromium and WebKit: each spacing sets the
  scale while control height, corners and colours stay; persistence; Focus,
  Projects, Board, Calendar, Timeline, List and Chart without sideways
  scrolling in both new spacings at 1440 and 320px. The captures of those views
  and of Settings were inspected.
- The full local gate, `.venv-check/bin/python scripts/check.py`, and in
  Chromium the suites that open Settings: `dialogs`, `loading`, `motion`,
  `localization`, `accessibility`, `responsive`, `menus` and
  `dialog-components`. The other suites were not rerun: the default spacing is
  unchanged by value, which the unit test holds.
- The initial download is 81,827 of 81,920 bytes.

## Limits

- Not checked on a physical phone.
- Timeline rows and Calendar hour heights come from the planning widgets'
  numeric dimensions and do not follow the spacing; only the padding around
  and inside their cells does.
- The two scales are a first proposal for the owner to judge on screen.
