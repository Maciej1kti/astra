# Layered entrances in every view — 2026-10-06

After the layered motion was [restored](2026-10-06-layered-motion-restored.md),
the owner asked for it in every view, charts included. An audit of all eight
views, the dialogs and the pairing page found the surfaces that still appeared
at once.

## What changed

- **Chart.** The controls, the counter list with its rows, each plot surface
  and heading, the note and the summary rows enter as layers once the first
  read has arrived. The marks of a plot rise from the baseline as one group
  (`--motion-rise`), after the readout values. They rise again when the
  selected counters, grouping, totals or range change, and stay still during
  a refresh.
- **Counter trends** in the card editor rise after their section.
- **Reports** get context and title layers like other cards.
- **List** filters, the cards listed under **Timeline**, the Calendar legend
  and help, the **pairing page** and the **sidebar** (or phone dock) use the
  same sequences. Save-status toasts and the connection banner rise softly.
- **A missing curve no longer throws.** When an entrance starts before the
  stylesheet has applied its tokens, the effect is skipped and the content
  simply appears. This was a rare existing race: one page load in a full
  Chromium run raised "Easing may not be the empty string" from every
  sequence on the page.

A plot costs one effect whatever its number of bars; no mark is animated
individually. The 16-candidate, 32-effect and 560 ms limits of a sequence are
unchanged, and off-screen items are still skipped.

## Verification

Release build in an isolated worktree, real daemon, disposable synthetic hosts.

- New `motion` scenario for Chart: every layer above must start, the marks
  must begin lower with a fixed baseline while the plot surface keeps its
  geometry, nothing may remain on settled marks, a refresh must replay
  nothing, a new grouping must let only the marks rise again and reduced
  motion must start none.
- New `motion` regression for the missing curve: with the easing tokens
  blanked, navigation must raise no page error and leave content fully
  visible. It failed before the guard with the same error as the full run.
- The card-layer scenario now inspects a List row that has labels, because
  row order differs between engines.
- `scripts/check.py` passes, with 461 JavaScript unit tests.
- Chromium: all 40 regression suites, the HTTPS smoke, the planning chain and
  the CLI tag workflow pass on the final build.
- WebKit: 39 of 40 suites pass. `responsive` still fails on the header
  project picker's height at 320px, as it did before these changes.
- An audit script counted the entrances started inside each view and dialog;
  every view, the card editor, settings, diagnostics and Git start layers.
  Paused frames of Chart and the pairing page were inspected.

## Limits

Browser checks on macOS, not a physical device or a frame-rate measurement.
The bundle is at 81,406 of 81,920 gzip bytes, so the next addition to the
initial load needs room made for it first. Summary rows and other items below
the fold appear without an entrance by design.
