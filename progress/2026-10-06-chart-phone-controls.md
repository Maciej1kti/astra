# Chart phone controls and value-only plots — 2026-10-06

The owner asked for three follow-ups to the
[Chart redesign](2026-10-06-chart-redesign.md), seen on a phone: put the range,
grouping and totals controls in one row; remove the scale choice so plots show
values only; and move that one row below the plot in place of **Pokaż dane
wykresu**, which is removed.

## What changed

- **One row below the plots on a phone.** In the shell's phone layout (at most
  700px wide) the three choices are menu buttons that name their current value
  and open the shared `ActionMenu` panel. The heading holds only the title, so
  the first plot now starts 287px down the page at 390px with the owner's
  counters, where it started at 555px. A custom range opens under the row. Desktop and tablet keep the
  segmented controls above the plots.
- **Values only.** The scale select and the relative and converted plot modes
  are gone from the view and from `chartPanels`. Rates still value the period
  summary and its **Razem** row; they no longer change a plot.
- **A new range keeps the page in place.** Changing only the dates used to
  empty the view while the read ran, which collapsed the page and sent a
  reader at the controls back to the top. `ChartData` now keeps the loaded
  series, dimmed, until the new range arrives; another project or archive
  scope still starts empty, and a failed range read clears the kept series so
  old values never sit under new dates. Two unit regressions cover this.
- **No per-plot data table.** The legend above each plot remains the place to
  read exact values, by pointer, touch or keyboard, and the plot's hidden
  slider announces the same reading. That slider is now the only non-visual
  route to a single period's values; the design system says to keep it.

## Verification

Another session was changing the phone navigation bar in the same checkout
while this was built. The change was therefore verified twice: alone, in a
clean worktree at `a420f25` that held only these files, and again on the main
tree after that session's `37f9aa5` and `8346a46` had landed.

- The 16-step gate passes in both places, and again on the main tree after
  the range fix: 389 Rust, 456 Node and 9 Python tests. Svelte reports no
  errors or warnings.
- The `charts` suite passes in release Chromium and WebKit in both places. It
  now reads every period's value from the legend with the keyboard slider, and
  at 390 and 320px requires the three menus to share one row below the last
  plot, to keep 44px targets, to open within the viewport and to change
  grouping, totals and range, including the custom range, with the range menu
  still in view after a new range loads. The first plot must start within
  400px at phone widths.
- `localization`, `navigation` and `responsive` pass in Chromium in both places.
- The 390 and 320px renders, the open grouping menu, the custom range under
  the row and the 1440px render were inspected.

Environment as in the redesign record. Logs and screenshots are in ignored
`test-results/chart-phone/` and `test-results/browser/chart-phone-final-*`.

## Limits

- Browser emulation is not a physical phone test.
- At 320px the three menus fit by using a smaller label size; a longer
  translated label would be cut with an ellipsis rather than wrap.
- Acceptance of the layout is the owner's.

## Existing application

The other session restarted the existing application from the shared tree while
this change was still uncommitted there, so that build already carried an
earlier state of these files. It was restarted again from the final verified
build at the existing `https://100.122.250.14:47832`, with the same launcher,
data directory, connection settings and certificate. Instance identity, command
epoch, both profiles, the certificate and key, workspace and root settings and
every counter series in both profiles are identical before and after; all 65
served assets match the local build, the CSP header is present, an
unauthenticated bootstrap returns `401` and `doctor` reports no issues.

A browser paired through the normal challenge and CLI approval opened Chart with
the owner's counters at 390px: three menus and no select or data table, the
first plot at 287px, and the page position unchanged (458px) after choosing
**90 dni** from the range menu, which switched grouping to weeks. At 1440px the
three segmented controls are above the plots. No alert, page error, server
error, overflow or write request was recorded, and the session was revoked,
leaving the 13 earlier sessions. The
[project result](../.project/updates/150a9840-0a6b-4869-a599-ed280330f785.json)
was appended and read back through the ordinary CLI.
