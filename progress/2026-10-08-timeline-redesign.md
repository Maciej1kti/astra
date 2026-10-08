# Timeline rebuilt — 2026-10-08

The owner asked for Oś czasu to be redesigned from the ground: it looked poor,
a hovered bar showed a second bordered box with a shadow inside it, there were
too many controls, every move or stretch asked for confirmation in a dialog,
weekends were not marked, and a click on a bar opened a date dialog rather than
the card. Reordering rows in the title column was to stay.

## What changed

- **No selection bar.** "Wybierz element", "Otwórz element" and "Edytuj
  zaplanowane daty" are gone, and so is the month field in the page filter.
  One toolbar remains: the month in view, **Dzisiaj**, month arrows and the
  scale as three buttons (Dni, Tygodnie, Miesiące), remembered by the browser.
- **Cards without dates stand above the axis** as "Bez harmonogramu", two rows
  at most with "Pokaż wszystkie"; the section is absent when there are none.
- **A bar is the card.** A click on it, or on its title in the left column,
  opens the card. Dragging it moves the plan and dragging an end resizes it;
  the bar follows the pointer between days, the dates it would get stand beside
  both ends and are marked on the day header, and a release saves them. No
  dialog appears unless the save was refused or its outcome is unknown.
- **The view is Astra's own**, not the SVAR Gantt widget
  ([ADR-075](../docs/ADR-075-TIMELINE-RENDERER.md)): a fixed header and title
  column, weekends shaded through header and rows, a line for today, a month
  name that stays in view, status tones on bars, titles that run on beside a
  short bar, an arrow to a plan that is out of view, and a last row that
  creates a card on a clicked day or a pressed range of days.
- **Keyboard and touch.** Alt+Left/Right moves a focused bar or end by a day
  (Shift: a week) and the steps are saved as one change. On touch a swipe
  scrolls and a 250 ms hold picks a bar up, so a swipe cannot change a date.
- `@svar-ui/svelte-gantt` and the packages only it used are removed from the
  dependencies and the notices.

The [design system](../docs/DESIGN-SYSTEM.md#timeline),
[user guide](../docs/USER-GUIDE.md#plan-work-and-events),
[code structure](../docs/CODE-STRUCTURE.md) and
[manual walkthrough](../MANUAL-TESTING.md#gantt-and-calendar-walkthrough)
describe it.

## Findings while building

- The reported box was the application's default button chrome: each of the
  three buttons inside a bar took a border and a hover fill, and the dragged one
  a white fill with a shadow. A bar is now one surface and the `timeline` suite
  requires its inner buttons to draw no border, fill or shadow.
- Saving on release raised a question the dialog used to hide: which version a
  second change to the same bar is proposed against while the first is still
  being saved. Waiting for the refreshed row and using its version would have
  overwritten a card changed elsewhere in between. A change is therefore
  proposed against the version the gesture observed, or the version this
  browser's own preceding save returned, and never one that only arrived with a
  read (`timeline-pending.ts`, unit tested). A bar moved over a competing edit
  still ends in the conflict dialog and returns to its saved days.
- Rows more than 18 months from the requested month are not drawn; their row
  offers a jump. Without that limit two cards years apart made an axis wider
  than a browser can lay out.
- While a dialog closes (about 0.2 s) the page behind it takes no input. That
  is the existing dialog behaviour; the browser scenarios now wait for it.

## Checks

On macOS, against the real daemon:

- Unit tests: `timeline-scale` (axis range, month, year and week segments,
  weekdays, clipping), `timeline-pending` (which version a change builds on),
  `date-gesture` (pixel movement, whole-day proposals, one-day minimum,
  cancellation, click suppression, touch hold) and the updated planning tests.
- The new `timeline` browser suite and the suites that reach Timeline:
  `ui-corrections`, `planning`, `loading`, `localization`, `command-outcomes`,
  `command-recovery`, `responsive`, `agent`, `comments`, `protocol`,
  `navigation`, `motion`, `appearance`, with `planning-browser.mjs` and the
  HTTPS smoke. Date-change outcomes that used the manual dialog are now reached
  through gestures.
- The captures at 1440 and 390px, light and dark, at each scale and during a
  move and a resize were inspected.
- The full local gate, `.venv-check/bin/python scripts/check.py`, and the
  complete Chromium run (44 suites, the smoke, `planning-browser.mjs` and the CLI tag workflow) on the release build; WebKit for `timeline`, `ui-corrections`,
  `planning` and `localization`.
- The initial download is 81,629 of 81,920 bytes. The Timeline chunk is about
  33 kB of script and 19 kB of styles before compression.

## Limits

- Not checked on a physical phone; touch was exercised through Chromium's
  emulation only.
- An accidental drop is saved, as there is no confirmation step. There is no
  undo; the card's dates can be set back by another gesture or in the card.
- Calendar keyboard date editing still opens the date form. Only Timeline was
  in scope.
- Timed events and milestones open from the Timeline but are not moved there,
  as before.
- A card without dates is given dates in the card; it cannot yet be dragged
  from "Bez harmonogramu" onto a day.
- The status tones, sizes and motion are a proposal for the owner to judge on
  screen.
