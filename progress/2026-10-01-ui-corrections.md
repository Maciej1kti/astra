# Focus, Calendar and Timeline corrections

Owner-directed UI corrections, 2026-10-01. Work starts at `89874fb` in an isolated
checkout; the active optimization checkout and unrelated owner card edits remain
separate. This is implementation evidence, not release or device acceptance.

## Behavior

- The main workspace header follows the panel's upper corner radius.
- In motion and Events reuse the In focus card body without pin/reorder gestures.
  Pinned overdue cards retain their relative schedule, without a duplicate badge.
  Needs my attention retains its grouped reasons.
- Calendar pointer moves/resizes submit the observed-version command on drop.
  Successful writes require no confirmation modal. Failed, conflicting and
  uncertain outcomes retain the proposal and ordinary recovery controls. Further
  date gestures are disabled while that command remains owned. Native gesture
  completion republishes canonical snapshots to clear mutated widget state.
- Calendar items display the event/plan/due symbols used in the legend.
- Timeline removes its editing disclosure and duplicate New scheduled card action.
  Row grips support pointer and Alt+Up/Down ordering, saved per project in this
  browser. The final empty row creates an ordinary draft on the clicked date;
  ArrowLeft/Right and Enter also choose/create a date. Ordering never changes
  card schedules, Board placement, source versions or API page order.
- Milestones are independent resources, not a card type. The maintained milestone
  API, CLI, date projections and project/milestone reports are used by ordinary
  fixtures and tests. The Timeline labels are clarified; sources and supported
  contracts are retained.

## Verification

The changed native month-popup regression fails on the unchanged release because
moving still opens Change planned dates. The repaired scenario verifies movement,
both boundaries, cancellation, durable source/projection versions and current
source opening. A lost acknowledgement after actual commit retains identical
request ID, epoch, payload and If-Match on retry. A competing conditional CLI edit
rejects the stale move without replacing the winner.

Chromium Focus, events and planning suites pass after updating the obsolete
Overdue badge assertion. The popup screenshot now captures the viewport: full-page
capture resized the native grid and closed its popup before keyboard opening.
The broad native planning suite passes, including a held background read across
resize, explicit form recovery, all Calendar layouts and cancelled gestures.
Timeline pointer/keyboard ordering, reload persistence and exact clicked-date
creation pass. The final keyboard-create probe exposed a missing initial date
on the synthetic empty row; the row now carries the displayed month's initial
date and the final WebKit suite verifies ArrowRight/Enter creation.
Seven final WebKit suites pass: UI corrections, month popup, Focus, planning,
events, dense Calendar layout and loading. No physical-device acceptance is claimed.

The full local gate passes 287 Rust, 172 JavaScript and seven Python tests
(466 total), plus types, contracts, package/links, formatting, boundaries, Clippy,
bundle and release build checks. The final frontend check/build follows the
empty-row keyboard correction. The final broad HTTPS smoke, native planning suite and all 27 Chromium
regression suites pass, including actual Chromium touch row dragging, keyboard
blank-row creation, dense month layout and command recovery. A final corner/cursor
style cleanup passes Focus/UI/responsive in Chromium and Focus/UI in WebKit.
Integration and
existing manual HTTPS restart/preservation verification remain in progress. Generated logs and screenshots
are in ignored `test-results/ui-corrections/`.
