# Card header and visible feedback — 2026-09-26

The card modal now has three persistent header rows: project context with the
archive/delete menu and Close; the editable title; then status, priority and pin
controls with a colored save indicator aligned right. The title uses the full
row and stays within two visible lines. Status options scroll on short screens.

A conditional fourth row owns editor errors, field validation, confirmations,
conflict details and retry/status/copy actions. It stays above the scrolling body;
long feedback has its own bounded scrolling area. Duplicate field errors are
removed, and old success messages are hidden during errors and confirmations.
Checklist/tag fields retain accessible error descriptions. No source/API rules,
request identity or autosave conflict behavior changed.

Verification on macOS ARM64 / Node 24 / release Chromium:

- Full local gate passed: 109 JavaScript, 232 Rust and 12 Python tests, contracts,
  typing, boundaries, formatting, Clippy, frontend and release workspace builds.
- Ten browser suites passed across the recorded runs: editor-header, editor-inputs,
  editor, autosave, comments, counters, deletion, card, tags and command-outcomes.
  The final run repeats header, card, comments, deletion and command-outcomes after
  feedback ordering/deduplication. Broad HTTPS browser smoke also passes.
- The new header suite checks a long scrolled card, ordered rows, empty-feedback
  hiding, colored Saved, field errors, response loss/recovery, comment success,
  discard/delete prompts and portrait/landscape layouts (320–1440px widths,
  including 740×320). Screenshots were inspected, including visible error/retry
  controls at 390px. Existing input coverage includes both themes.
- The initial header test caught whitespace keeping the empty feedback row visible;
  the corrected empty-content selector passes. Existing tests were updated for
  the moved field alerts and shortened conflict heading. An unchanged autosave
  timing check passed on rerun. One repeated full gate encountered a transient
  WouldBlock reopening a maintenance-test fixture; the unchanged full gate rerun
  passed. No production storage behavior or test bounds were weakened.
- Rebuilt embedded frontend/release daemon and restarted the existing manual app.
  All 15 source resource versions, two pins and TLS certificate matched across
  restart. Both projects validate without issues. Verified the existing HTTPS
  address with its certificate and checked the served header/feedback assets.

Evidence: ignored `test-results/editor-header/` contains gate logs, initial and
final browser results, screenshots, HTTPS smoke, restart snapshots and validation.
Physical iPhone/Safari acceptance remains open. Unrelated live source-card edits
were preserved and excluded from the commit.
