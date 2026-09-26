# Daily card counters — 2026-09-26

Cards now hold named daily counters in their source JSON. Each counter has a
unit (up to five characters), integer step, stable ID and dated totals. The modal
shows today's result in the workspace timezone, uses local +/- drafts and saves
only on explicit OK. Missing days display zero; prior days remain in history.
Configuration, hide/restore and a daily history table are available in the shared
modal. Card summaries show the number of visible counters.

The API/CLI share conditional configure/record operations through the existing
durable writer. Ordinary edits and undo cannot erase counter history. Units are
fixed after the first result; hidden counters retain all dates. Counter drafts
survive autosave, pins, unrelated confirmations and conflicts. An unfinished draft
crossing midnight retains its original date. See
[ADR-049](../docs/ADR-049-DAILY-CARD-COUNTERS.md) for semantics and bounds.

Verification on macOS ARM64 / Node 24 / release Chromium:

- Full local gate passed: schemas/examples, OpenAPI, 12 Python tests, 109 JS tests,
  frontend types, boundaries, formatters, Clippy, 232 Rust tests (including
  subprocess durability/recovery), frontend and release workspace builds.
- New domain/application regressions cover daily replacement, multiple dates,
  invalid dates/values, retained metadata limits, replay, stale versions, ordinary
  edits, archive protection, context, source JSON and restart.
- Release browser suites passed: counters, comments, autosave, editor and focus.
  Counter coverage includes three counters, explicit OK, protected drafts,
  hide/restore, unit protection, response loss/retry, concurrent conflict and
  midnight rollover with a browser timezone different from the workspace.
- Layout reviewed at 320, 390 and 1440 px; browser screenshots show no horizontal
  overflow. This does not establish physical iPhone acceptance.
- Initial gate caught an expected summary fixture that lacked the new count;
  the updated projection fixture includes visible and hidden counters. The initial
  counter browser run reached the midnight scenario but its future test clock
  caused normal request admission rejection. The corrected scenario verifies
  rollover, then restores real request time before confirmation; it passes.
- Rebuilt embedded frontend/release daemon and restarted the existing manual
  launcher. All 14 source resource versions, two pins and TLS certificate matched
  across restart. Both registered projects validate with zero issues. Verified
  the existing HTTPS address using its certificate and confirmed the served
  JavaScript includes counter UI/configuration/recording.

Evidence is ignored under `test-results/counters/` (full gate, initial browser
run, corrected counter suite, restart snapshots, validation and HTTPS result).
Other passing browser suite artifacts are under `test-results/browser/regressions/`.
No acceptance status, dates or unrelated source cards were changed. History uses
one total per day and whole nonnegative numbers, rather than every OK event.
