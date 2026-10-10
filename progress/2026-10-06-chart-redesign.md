# Chart view redesign — 2026-10-06

The owner asked for the counter Chart view to be rebuilt so that it looks right
and works well on desktop, tablet and phone. The reads, the API, the CLI and
[ADR-062](../docs/ADR-062-COUNTER-CHART-DASHBOARD.md) are unchanged; this is a
presentation change in `apps/web/src/features/charts`. The
[user guide](../docs/USER-GUIDE.md#compare-counters-in-chart) and
[design system](../docs/DESIGN-SYSTEM.md#chart-view) describe the result.

## What was wrong

Read from the 2026-10-04 screenshots of the same synthetic counters:

- The plot panel began about 1,420px down the page at 390px and 1,260px down at
  768px, below the range form, four summary tiles and the whole counter list.
- Sparse daily totals were drawn as a line with gaps, which left isolated 2px
  dots. A running total had the same gaps.
- Series borrowed the success, notice, danger and muted status colours, and a
  colour followed the row position, so removing one counter repainted the rest.
- A counter appeared three times: catalog, statistics table and conversion card.
  The statistics table hid four of seven columns behind sideways scrolling on
  tablet and phone, and the phone catalog was a 250px nested scroll area.
- Two of the four tiles restated the controls.

## What changed

- **Plot first.** Range presets share the heading row and a custom range opens
  on demand. From a 940px-wide view the counter list is a sticky rail; below
  that it collapses in place to one row with the selection count. The plot panel
  now begins about 430px down the page at 390px and 768px.
- **Form follows the data.** Period totals are grouped bars with a stub for a
  recorded zero and nothing for a missing period. Dense ranges fall back to
  lines that break at gaps. A running total is a stepped line that stays level
  between recordings; its exact-value table still shows a dash for an
  unrecorded period. Axis steps are round values.
- **Grouping follows the range** until one is picked: days to 45 days, weeks to
  180, months beyond.
- **Colour.** Eight ordered `--series-*` tokens replace the status colours. The
  set passes the lightness, chroma, colour-vision (worst adjacent ΔE 9.1 light,
  8.4 dark) and normal-vision checks on `#ffffff` and `#24252a`. Three light
  steps are below 3:1, so every plot keeps a named legend and a table. A
  counter keeps its slot while the selection changes.
- **Reading values.** The legend shows each series' value for one period,
  starting with the latest recorded one, and follows the pointer, a touch drag
  or the arrow keys. The slider is visually hidden and announces the same
  reading.
- **One summary.** Statistics and rates share one ARIA table with a totals row;
  below an 860px container each counter becomes a card. The summary tiles are
  gone; their figures are in the list heading, the period caption and the
  totals row.
- `ChartDashboard.svelte` is split into `ChartRange`, `ChartCounterPicker`,
  `ChartPlot`, `ChartSummary` and `ChartSegments`, which closes the item left
  open in the [review completion](2026-10-05-review-completion.md#left-open).

Two labels changed with the layout: **Także zarchiwizowane** (was *Uwzględnij
zarchiwizowane liczniki*) and **Od**/**Do** with **Zastosuj zakres** for the
custom range. Stored rates and the output unit keep their browser key.

## Verification

- The 16-step local gate passes: 389 Rust, 454 Node and 9 Python tests, plus
  contracts, links, types, lint, formatting, boundaries, strict Clippy and the
  release build. Svelte reports no errors or warnings. The initial bundle is
  80,043 bytes gzip against the 81,920-byte limit.
- Four new unit tests cover the stepped running total, round axis steps and
  band geometry, the bar layout and zero stub, and stable colour slots.
- The `charts` suite passes in release Chromium and WebKit through the real
  daemon. Beyond its earlier coverage it now asserts bar marks with a zero stub,
  the stepped line, the dense-range line form, range-following and chosen
  grouping, colour retention after deselection, the custom-range disclosure,
  and at 1440/1024/768/390/320px: 44px segment targets, no page overflow,
  unclipped total/best-day/converted figures, the collapsed list and a plot
  that starts within the first 640px.
- `localization`, `navigation`, `responsive`, `loading`, `accessibility` and
  `motion` pass in Chromium; `localization` and `navigation` pass in WebKit.
  No page error, CSP violation or source write was recorded.
- The first WebKit run reported a ResizeObserver loop: the plot measured the
  element whose height it then set. Width now comes from a zero-height sibling
  and the rail layout is a CSS container query.
- Light desktop, tablet and phone renders, the open phone list, month and year
  ranges, the running total, the custom range with its error and the dark 320px
  render were inspected.

Environment: macOS 27.0.1 arm64, Node 24.11.0, Rust 1.92.0, Playwright 1.63.0
with Chromium build 1243 and WebKit build 2359. Logs and 25 screenshots are in
ignored `test-results/chart-redesign/` and
`test-results/browser/chart-redesign-final-chromium/` and `-webkit/`. The
histories were synthetic and lived in temporary hosts.

## Remote workflow

The push of `9170612` started the source workflow automatically. On both
systems its gate step passed and its browser step was still running when the
owner directed that verification stay local; its outcome was not awaited and
is not part of this record. The workflow now starts only by manual dispatch.

## Limits

- Browser emulation is not a physical iPhone or iPad test. Touch dragging was
  exercised as Chromium touch taps, not as a finger on a device.
- Hover with a mouse was not captured in a screenshot; the pointer path shares
  its handler with the tested tap and keyboard paths.
- The palette's forced-colours and print appearance were not checked.
- The other WebKit suites, including the known `responsive` failure, were not
  rerun for this change.
- Product acceptance of the new layout is the owner's.

## Existing application

The rebuilt embedded frontend and release daemon run at the existing
`https://100.122.250.14:47832` with the same launcher, data directory,
connection settings and certificate. Read-only snapshots before and after the
restart are identical for instance identity, command epoch, both profiles,
the certificate and key, workspace and root settings, and every counter series
with its values and source version in both profiles; only the per-process
snapshot cursor differs. All 65 served assets match the local build over the
existing certificate, the CSP header is present, an unauthenticated bootstrap
returns `401` and `doctor` reports no issues or warnings.

A browser paired through the normal challenge and CLI approval opened Chart with
the owner's counters at 1440, 768 and 390px and switched the range: no alert,
page error, server error, page overflow or write request. Its session was
revoked afterwards, leaving the 13 earlier sessions. The owner's own card edit
and resolution report remain outside this change. The
[project result](https://github.com/Maciej1kti/astra/blob/498b3a1eac6acabe399e0c49fb8849da24cf6350/.project/updates/4180d182-0cd1-4e75-b4a4-cc7fac32e81e.json)
was appended and read back through the ordinary CLI.
