# Counter Chart dashboard — 2026-10-04

Implemented the owner's workspace Chart view. It discovers card counters across
the selected project or workspace, including counters without recorded history.
Select up to eight histories, inspect daily or running totals, group by day,
Monday-based week or month, and compare quantities, recorded days, averages,
peaks and same-unit differences. Raw units get separate plots; relative mode
compares each series against its own plotted peak. Each plot has a keyboard/touch
date inspector and an exact-value table. Missing dates remain gaps and recorded
zero remains present.

Individual rates multiply saved quantities into a chosen output unit and a
combined converted total. Rates and the output label are browser-local per
instance/profile; they do not change source quantities, units or counter history.
The new authenticated API and CLI read clip histories to at most 400 inclusive
days, page 100 series at a time and preserve scoped snapshot staleness. The browser
caps its catalog at 500 entries and refreshes already loaded pages before atomic
publication. See [ADR-062](../docs/ADR-062-COUNTER-CHART-DASHBOARD.md),
[user guide](../docs/USER-GUIDE.md#compare-counters-in-chart) and
[CLI](../CLI.md).

## Verification

- Full local gate passes 528 tests: 333 Rust, 188 Node and 7 Python, plus generated
  contracts, schema/example/link validation, boundaries, formatting, strict Clippy
  and release builds. Svelte reports zero errors and warnings. Final plot and
  unit-comparison refinements pass another type/build/format check and 32 focused
  frontend tests. The final initial bundle is 80,069 bytes gzip, below 80 KiB.
- Five application regressions cover sparse/zero totals, inclusive ranges,
  empty/completed/archived histories, versions, scope, stale cursors, invalid and
  pending sources, persisted Chart defaults and the 100-series/400-day byte bound.
  CLI and authenticated compressed transport checks cover strict query handling.
- Chart passes all nine browser check groups in release Chromium and WebKit.
  Ordinary conditional commands seed seven temporary counters, including a
  continuous fourteen-day history. Coverage includes exact aggregation/statistics,
  different units, rates, zero/missing history, archive discovery, date validation,
  source invalidation during a held read, obsolete project responses, current
  source opening, phone More navigation and rate persistence after reload.
- The existing navigation, loading and counter suites pass in both engines;
  Chromium code-health also passes. Chart's 320–1440px light/dark layouts and focused
  phone plots were inspected. Keyboard and Chromium touch inspection pass; browser
  errors, CSP violations and browser source mutations remain absent.

Environment: macOS arm64, Node 24.11.0, Rust 1.92.0, Playwright 1.63.0,
Chromium 153.0.8010.12 and WebKit 26.6. Logs and runtime snapshots are in ignored
`test-results/charts/`; final Chart artifacts are in
`test-results/browser/chart-final-chromium-pass/` and
`test-results/browser/chart-final-webkit-pass/`. Temporary hosts and synthetic
projects are removed by the browser harness. No histories were fabricated in the
owner's existing counters. Physical-device and full-release acceptance remain open;
this does not close the earlier broad responsive-suite limitation.

## Existing application

Rebuilt the embedded frontend and release daemon, then restarted the existing
manual app at `https://100.122.250.14:47832`. Trusted HTTPS verifies all 36 assets.
Before/after checks preserve all 29 prior source versions, two Focus pins,
profile names/registrations/approved roots/preferences, instance identity,
command epoch and certificate. The live counter read returns the three existing
series with no warnings. A concise result is appended and read back through the
explicitly selected Astra project using the ordinary CLI command contract.

The owner's pre-existing Astra card edits remain outside this change and commit.
