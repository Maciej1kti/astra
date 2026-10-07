# Plugins and Chart tile values — 2026-10-07

The owner asked to separate what serves every user from the Tomek/Maciek
settlement only the owner needs, by making the calculations plugins, and to
let each summary tile choose its values in a dialog. Decision record:
[ADR-073](../docs/ADR-073-PLUGINS-AND-CHART-TILES.md).

## What changed

- **Plugins.** A plugin is a built-in module switched on per profile under
  **Ustawienia → Wtyczki**. `Preferences.plugins` stores the enabled
  identifiers. `ChartPlugin` defines two places in the Chart view; the
  settlement (`chart-settlement`) and the Razem totals (`chart-totals`) moved
  into `features/charts/plugins/` with their logic. Both start off.
- **Tiles.** The summary is a grid of tiles at every width. A tile is a button
  opening `ChartTileDialog`, which lists eleven values: the six shown before
  plus the total and value since the first recording, the average over every
  day of the range, the last recording and the difference. The choice is per
  counter, stored in `Preferences.chart_tiles` and saved conditionally.
- **Protocol.** Both preferences are optional, bounded and replaced whole by
  the existing conditional preferences patch. Schemas, OpenAPI, generated
  types and a request example changed together.

## Verification

- The 16-step local gate: steps 1 to 14 pass in one run. Step 15 failed in
  two `projectctl` query tests, as it had in the previous change. The cause
  was a race in the test's own mock server: its listener is non-blocking and
  on macOS an accepted socket inherits that mode, so a read before the CLI had
  written returned `WouldBlock`. The mock now sets the accepted socket to
  blocking. After the fix `cargo fmt`, `clippy -D warnings`, the whole
  `cargo test --workspace` (481 tests) and the release build of step 16 pass.
  526 Node tests pass.
- Engine regression: both preferences are stored, kept by an unrelated patch,
  replaced, cleared and survive a restart; nine malformed shapes return 422.
- All 41 browser suites pass in release Chromium; `charts` and `counters` pass
  in WebKit. `charts` checks that neither plugin shows by default, switches
  both on through the profile, chooses a tile's values in the dialog and reads
  them back from the stored preferences, cancels a choice, opens the card
  from the dialog, switches a plugin off in Settings, and asserts that the
  view's only writes are two preference patches.
- The tile dialog, the 390px view and the 1440px view were inspected.

Logs are in ignored `test-results/plugins/`.

## Limits

- The owner's profile has both plugins off until they are switched on in
  Settings; the settlement is therefore not shown at first.
- A plugin can only be added in a release; nothing is loaded at run time.
- A profile stores tile choices for at most 200 counters.
- The initial bundle is at its 80 KiB budget exactly.
- Browser emulation is not a physical phone test. Acceptance is the owner's.
