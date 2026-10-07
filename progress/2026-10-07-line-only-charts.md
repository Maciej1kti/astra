# Chart view: dots joined by lines only — 2026-10-07

The owner asked for every plot in the Chart view to draw dots joined by lines,
always, with no bars in any of its modes. During the work the owner added that
the compact counter preview on a card keeps its bars.

## What changed

- **One plot form.** `ChartPlot` draws each recording as a dot and joins
  consecutive recordings of a series with a 2px line, for period totals and
  running totals, at every range and grouping. Grouped bars, the fallback that
  chose between bars and lines by band width, and the stepped running-total
  line are removed, with `chartBar`, `chartBarLayout` and `chartStepLine`.
- **Lines span periods without a recording.** `chartLine` used to start a new
  segment after each gap, which left separated recordings as unjoined dots. It
  now joins every recording; only a dot marks a recording, and a recorded zero
  is a dot on the zero line. The legend still reads **Brak zapisu** for a
  period without one, and a running total still shows its carried value there.
- **Inspection and legend.** The inspected period is always a hairline, and
  the legend key is always a line swatch.
- **Note under the plots** now describes dots and lines in both totals modes.
- **Card counter preview unchanged**, by the owner's direction.
- **Four counters selected on opening**, where there were three, by the
  owner's follow-up the same day. `charts` and `motion` pass with it.

## Verification

- Node unit tests pass (518), including the rewritten `chartLine` cases.
  `svelte-check`, ESLint, Prettier and the bundle budget pass.
- `charts` passes against the release daemon in Chromium and WebKit; it now
  requires dots, one joined line per series, straight running-total segments
  and no `rect` in any plot. `motion`, `responsive`, `counters` and
  `localization` pass in Chromium, `counters` also in WebKit.
- The 1440px period-total and running-total renders and the 320px dark render
  were inspected.
- The full gate was not run: this is a contained view change.

Screenshots are in ignored `test-results/browser/regressions/charts/`.

## Limits

- Browser emulation is not a physical phone test.
- A line across a long gap can suggest values that were never recorded; the
  dots and the legend remain the record. Acceptance is the owner's.
