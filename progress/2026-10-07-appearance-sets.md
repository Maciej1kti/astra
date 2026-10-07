# Appearance sets — 2026-10-07

The owner asked for more than one light and one dark look, chosen in a
pleasant menu, and decided two things when asked: a set changes character as
well as colour, and colours and character are chosen separately.

## Finding

Every colour, radius, shadow and typeface already came from about 140 tokens in
`styles/tokens.css`, guarded by `scripts/tests/style-rules.test.mjs`, and the
planning widgets read the same tokens. No component had to change for a new
look. What stood in the way was the rule that the palette exists once, and a
plain three-option select for the theme.

## What changed

- **Ustawienia → Wygląd** has four choices: the theme, four light palettes
  (Astra, Papier, Szałwia, Kreda), four dark palettes (Astra, Atrament, Kakao,
  Czerń) and four characters (Astra, Miękki, Redakcyjny, Techniczny). Each
  option is a card with a miniature drawn from that option's own values; the
  theme cards show the two palettes that are chosen. The system theme switches
  between the chosen light and dark palette. All choices are browser-local, as
  the theme was.
- The section was rebased onto the Settings rebuilt the same day
  ([boards, calendar and settings](2026-10-07-boards-calendar-settings.md)) and
  uses its cards and its scheme-scoped workspace miniature.
- Palettes and characters live in `styles/appearance-sets.css`, which the
  first load does not carry: it is requested before the application renders
  only when a stored choice is not the default, and by Settings.
- A character can give headings their own typeface (`--font-display`): serif in
  Redakcyjny, fixed width in Techniczny. Typefaces are system ones; nothing is
  fetched and the CSP is unchanged.
- The [design system](../docs/DESIGN-SYSTEM.md#appearance-sets) and
  [user guide](../docs/USER-GUIDE.md#appearance) describe the sets and how to
  add one.

## The bundle budget

The initial download had 10 bytes left under its 81,920-byte budget, and the
first version of this change exceeded it by 1,865. The budget was not raised.
The sets moved out of the first load as above; the startup code that restores
them replaced the separate theme and hand helpers with one loop; and the eight
`--series-*` colours, used only by the Chart view, moved to `styles/series.css`
loaded with that view. On its own base the change left 3 bytes; combined with
the rebuilt Settings the initial download is 81,805 bytes, 115 under the
budget. Any larger addition to the first load needs a matching removal.

## Checks

Release build, on macOS:

- `scripts/tests/appearance.test.mjs`: every palette and character names the
  complete set of values and has a menu entry; `tokens.css` equals the default
  blocks; text contrast in all eight palettes (4.5:1 for text and state colours
  on their surfaces, 7:1 for body ink and the primary button); stored choices,
  an unknown stored value, missing browser storage, and the sets stylesheet
  being requested only for a non-default stored set.
- The new `appearance` browser suite in Chromium and WebKit, described in the
  [browser guide](../scripts/browser/README.md#appearance-verification).
  Rendered captures were inspected for all eight palettes and four characters
  in Settings at 1440, 390 and 320px, and for Focus, Board, Calendar and Chart
  in non-default sets.
- The full local gate, `.venv-check/bin/python scripts/check.py`, and
  `ASTRA_TEST_PROFILE=release npm run test:browser`: the CLI tag workflow,
  smoke, planning and all 43 Chromium suites. `charts` covers the series
  colours after their move. WebKit ran the `appearance` suite only.

## Limits

- Not checked on a physical phone. `ui-rounded` (Miękki) exists in Safari only;
  Chromium shows the interface face, so on a Chromium browser Miękki differs
  from Astra by its corners and shadows alone.
- Chart series colours are shared by all palettes of a scheme and were checked
  for colour-vision separation on the default surfaces only.
- The palettes' hues and names, and the four characters, are a first proposal
  for the owner to judge on screen; acceptance is the owner's.
