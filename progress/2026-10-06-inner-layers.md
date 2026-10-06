# Layers inside menus, dialogs and disclosures — 2026-10-06

After the entrances reached [every view](2026-10-06-motion-everywhere.md) the
owner asked for the same inside menus, modals, settings and the phone menus.
Those surfaces already arrived in layers, but coarsely: a dialog faded its
sections as whole blocks, the navigation menu faded as one wrapper, and a
disclosure or a row added later appeared at once.

## What changed

- **Dialogs.** The children of each body block follow that block from 260 ms
  in 36 ms steps: fields, notes and actions in Settings and the other
  dialogs, and the checklist, counter, comment, schedule and tag rows of a
  card. A sequence may now start 48 effects instead of 32; the 16 candidates
  per descriptor and the 560 ms delay limit are unchanged.
- **Menus.** Every item is its own layer. The navigation menu's wrapper is no
  longer a layer, so its heading and links enter one by one like the items of
  the status, header, project, Chart and counter menus.
- **Disclosures.** Opened content rises softly everywhere. **Dostosuj
  nawigację** also staggers its rows, one frame after opening so they are
  measured where the repositioned panel shows them.
- **Later arrivals.** Editor feedback, new comments, counters and tag rows
  fade in. This is opacity only, and reorderable lists are left out because
  moving a row would restart the effect.
- Chart and group sequences moved beside the lazily loaded code that uses
  them, which keeps the initial bundle within its budget.

## Verification

Release build in an isolated worktree, real daemon, disposable synthetic hosts.

- New `motion` scenario: Settings fields must start at least 100 ms after
  their block and within the 560 ms limit; an opened disclosure must run the
  reveal; the phone header menu, the navigation menu links and the
  customization rows must enter in turn; the menu wrapper must not be a layer;
  reduced motion must start none.
- `scripts/check.py` passes, with 461 JavaScript unit tests.
- Chromium: all 40 regression suites, the HTTPS smoke, the planning chain and
  the CLI tag workflow pass on the final build.
- WebKit: 39 of 40 suites pass. `responsive` still fails on the header
  project picker's height at 320px, as it did before these changes.
- Paused frames of Settings, the header menu, the navigation menu and its
  customization were inspected, and a probe listed the delay of every layer
  in Settings, the card editor and four menus.

## Limits

Browser checks on macOS, not a physical device or a frame-rate measurement.
Native `<select>` lists, such as the project and folder choosers, are drawn by
the system and cannot take an entrance. The bundle is at 81,359 of 81,920 gzip
bytes.
