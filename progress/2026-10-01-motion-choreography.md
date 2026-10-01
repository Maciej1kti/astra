# Readable motion and distinct opening layers

Owner feedback, 2026-10-01: motion across the application appeared nearly finished
as soon as it became visible. The follow-up explicitly asks for element-specific
timing and layered entrances. Work uses an isolated checkout from `5b7bc3b`,
preserving concurrent repository and owner planning changes.

## Cause and behavior

The previous easing completed over 90% of the dialog's 24px travel at about
150 ms. A rendered row sampled at exactly 150 ms retained only 0.98px of its
12px movement; the new regression fails on that release. Initial Chromium
frame probes at normal and CPU ×4 speed start at zero progress, so those probes
do not establish a lost-first-frame bug. The short visible travel, nested fades
and initial tag pulse explain the observed rushed ending in the sampled cases.

The shared curves now spread visible movement over the entrance. At the same
150 ms sample, rows retain 5.20px of travel and dialogs retain 10.40px, with the
surface already readable. Navigation still has about 29% of its travel remaining.
These are rendered animation samples, not latency or frame-rate benchmarks.

- Backdrop and surface lead. Page/dialog headings, actions, sections and metadata
  have separate roles and durations, with no whole-body fade over animated sections.
- Dialog context starts at 60 ms, title at 110 ms and status controls at 175 ms.
  Body sections follow their saved visible order from 200 ms in bounded steps.
  Tags start after their own section. Only an explicit tag add runs the chip pulse.
- Workspace headings/actions/filters, planning controls, card metadata, menu items
  and suggestion rows have their own short sequences. Surfaces become opaque
  early enough to expose the content's motion.
- One opening/navigation key owns each sequence. Draft edits and source refreshes
  do not replay it. Native focus, dismissal guards and command ownership remain.
  Reduced motion cancels every active layer and prevents future effects.
- Local sequences measure at most 32 targets, with delays capped at 560 ms.
  Scenes retain 24 primary candidates and at most 24 metadata groups. Measurements
  precede animation writes. Gesture surfaces/controls only fade; dense planning
  widgets do not acquire per-event animations or persistent DOM observers.

Maintained behavior and ownership are documented in the
[design system](../docs/DESIGN-SYSTEM.md), [user guide](../docs/USER-GUIDE.md),
[code structure](../docs/CODE-STRUCTURE.md) and [browser guide](../scripts/browser/README.md).

## Verification

The motion regression samples the real rendered navigation, row, dialog and menu
effects, checks distinct context/title/section/tag delays and bounds, and verifies
that adding a tag gives feedback without replaying mounted sections. It retains
rapid navigation, native focus/menu reversal, live reduced motion, CSP, dark
appearance and 1440/1024/768/390/320 px coverage.

Desktop light and mobile dark sequences are inspected at 120, 280, 460 and 960 ms,
including settled card editors and Projects. Existing WebKit responsive/header
size and broad-dialog screenshot/CSP/pointer-focus limitations also appear in the
initial tuning probes; they remain outside the successful selected suites. No
assertion or CSP is relaxed. See the earlier
[saved-control evidence](2026-10-01-calendar-popup-rendering.md).

The final full gate, after integrating concurrent backend work, passes 289 Rust,
172 JavaScript and seven Python tests (468 total), types, formatting, contracts, package/links, boundaries, Clippy, bundle
and release build checks. Rust tests run serially with debug/incremental artifacts
disabled for available disk capacity. The integrated gate initially ran out of
disk space in the real source-bound test; removing stale build artifacts only
from this isolated checkout allows the unchanged full gate to pass. Seven selected WebKit suites pass: motion,
editor opening, editor, card layout, card calendar, Focus controls and planning.
All 28 Chromium suites and the broad HTTPS smoke pass. Motion and normally paired
protocol checks pass again in Chromium and WebKit after the backend integration;
the rendered 150 ms samples and independent section/tag delays remain.
Application commit `b54ef06` is integrated on top of the concurrent backend and
verification commits. The primary frontend and release daemon are rebuilt; all
33 frontend files match the tested checkout. The existing manual launcher is
restarted with its current data, connection settings and certificate. Trusted
HTTPS at `https://100.122.250.14:47832` verifies all 32 served assets; all 78 prior
resource versions, three pins, preferences, certificate, instance and command
epoch are unchanged. The normal CLI result report
`2fddb0d4-b260-4f48-85b0-bd6d4e989ead` is committed and read back with matching
source/version. The two unrelated owner card edits remain separate.
Generated output is retained in ignored `test-results/motion-choreography-2026-10-01/`.
