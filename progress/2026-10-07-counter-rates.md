# Counter rates and whole-history totals — 2026-10-07

The owner decided that a rate belongs to a counter and is saved in its card,
and that the Chart settlement must count the whole history instead of a
400-day window. The owner also asked for the settlement panel to lose its "Do
wyrównania" line and the sentence explaining who a person is. Decision record:
[ADR-072](../docs/ADR-072-COUNTER-RATES-AND-HISTORY-TOTALS.md).

## What changed

- **Protocol.** `CardCounter.rate` is an optional exact decimal string.
  `configure_counter` accepts `rate`: a string stores it, `null` removes it,
  an omitted field keeps the stored one. `CounterSeries` carries `rate` when
  set and a required `history` object with `total`, `recorded` and
  `first_date` over every saved date. Schemas, OpenAPI, generated types and
  examples changed together.
- **Server.** `counters::patch` applies the rate inside the ordinary
  conditional write; the counter view computes history totals in the same SQL
  snapshot as the range values.
- **Card editor.** A counter's settings have a **Stawka** field beside unit
  and step. A decimal comma is accepted and stored with a dot; anything else
  blocks saving.
- **Chart.** The settlement multiplies each counter's whole-history total by
  its stored rate. The summary shows rates read-only. The second 400-day read,
  browser-stored rates, the copying of a rate across an activity and the
  catch-up line are removed; rates left in browser storage are ignored.

## Verification

- The 16-step local gate: steps 1 to 14 pass in one run. In step 15 two
  `projectctl` query tests for calendar and search hit the three-second read
  timeout of their in-test server while the machine was loaded; the same test
  binary then passed three times in a row, and a separate full
  `cargo test --workspace` passed with 480 tests, followed by the release
  build of step 16. 520 Node tests pass.
- All 41 browser suites pass in release Chromium.
- Engine regressions: a rate is stored, kept by a configuration that omits
  it, replaced, cleared with `null`, never stored from a `null` on creation
  and survives a restart; nine malformed spellings are rejected with 422;
  history totals include dates outside the requested range and the read
  leaves the source untouched.
- Node unit tests cover rate input normalisation, the settlement and the
  preferences that now keep only the output unit.
- Browser suites against the release daemon: `counters` sets a rate in the
  card editor, rejects a non-number and reads the stored value from the
  source; `charts` reads rates from counters, shows them read-only and
  settles a debt that includes a recording 900 days old, outside any range the
  view can request. Both pass in Chromium and WebKit.
- The 390px render of the settlement and summary was inspected.

Logs are in ignored `test-results/counter-rates/`.

## Limits

- The owner's counters have no stored rates yet: each needs its rate typed
  once in its settings on the card. Rates typed into the Chart by earlier
  versions stayed in a browser and are not migrated.
- The money unit is still a browser-local label, not source data.
- A person is still the last word of a counter's name.
- Browser emulation is not a physical phone test. Acceptance is the owner's.
