# Chart settlement and uniform phone cards — 2026-10-07

The owner found that counters were laid out differently across the Chart view
on a phone and asked for the layout to be rethought around its key
information: who owes whom how much money, by the view's own calculations.
Asked how to compute it, the owner chose: whoever has the lower value pays the
difference, and a counter's person is taken from its name only.

## What changed

- **Rozliczenie comes first.** `ChartSettlement` sits above the counter list
  and the plots on every width. `chartSettlement` takes the last word of a
  counter's name as the person (a one-word name has none), sums total times
  rate over each person's rated counters in the range and has the lower value
  pay the difference, pair by pair when there are more than two people. The
  panel shows payer, arrow, receiver and the amount, each person's value and
  the rule. Counters without a rate are left out and counted in a note; with
  no rates the panel asks for them; with fewer than two people it is absent.
- **One card layout on a phone.** Summary cards share one grid: name and
  total, rate and value, three quiet statistics and the difference line, which
  the reference counter now keeps. Legend entries keep one height with or
  without a recording.
- Rates and the output unit stay browser-local, as before; nothing new is
  stored and no protocol changed.

## Verification

- Node unit tests pass (519), with a new settlement case: two and three
  people, an unrated counter, one-word names and no rates.
- `charts` passes against the release daemon in Chromium and WebKit with a new
  scenario at 390px: no panel without people, the request for rates, the debt
  and both values after rates, the unrated note, the panel above the first
  plot, identical cell positions in all four cards and no horizontal overflow.
  `motion`, `responsive` and `localization` pass in Chromium.
- `svelte-check`, ESLint, Prettier and the bundle budget pass. The full gate
  was not run.
- The 390px and 1440px renders were inspected.

Screenshots are in ignored `test-results/browser/regressions/charts/`.

## Limits

- A name's last word is the only way to assign a person, so unrelated
  counters such as "Work hours" and "Study minutes" read as two people.
- Summary values keep their shorter number format ("150"); the settlement
  shows two decimals ("158,50").
- Browser emulation is not a physical phone test. Acceptance is the owner's.
