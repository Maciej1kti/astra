# Shared application motion

Owner-directed motion work, 2026-10-01. Implementation uses an isolated worktree
from `89874fb`, rebased onto the concurrent UI corrections at `71ce0c4`. Existing
Focus presentation, automatic Calendar saves and Timeline interactions are retained.
Unrelated owner planning sources remain separate. This is implementation evidence,
not release or physical-device acceptance.

## Behavior

- Shared duration, distance and easing tokens drive entrances, selection, feedback
  and exits. Navigation moves a single measured selection surface through the
  desktop sidebar and mobile dock; interrupted movement retargets from its actual
  position.
- Loaded views reveal visible headings/cards/rows in a bounded cascade: at most
  24 candidates, 420 ms duration and at most 160 ms stagger delay. Refreshes and
  typing do not replay it. Board, Calendar and Timeline own explicit readiness
  boundaries; gesture surfaces fade without changing their geometry.
- Native dialogs lift into place with a fading backdrop and staggered content.
  Dialogs and menus retain their native layer for a 150 ms inert exit; accessibility
  presence follows logical dismissal and reversals, and focus returns after close
  without stealing it from a newer modal. Deferred editor handoffs stay immediate.
- Buttons compress and recover, selected icons respond, cards lift on fine-pointer
  hover, and chips, saved feedback and disclosures use the same motion vocabulary.
- Operating-system reduced motion disables effects, including a preference change
  during an active animation. Effects release their observers, frames and animations
  when their owning component is destroyed. No dependency or protocol changes.

The maintained [design system](../docs/DESIGN-SYSTEM.md),
[user guide](../docs/USER-GUIDE.md), [ownership guide](../docs/CODE-STRUCTURE.md) and
[browser instructions](../scripts/browser/README.md) describe the implementation.

## Verification

The final integrated application passes the full local gate: 287 Rust,
172 JavaScript and seven Python tests (466 total), plus frontend types, formatting,
contracts, package/links, module boundaries, Clippy, bundle and release build checks.
Rust tests run serially with debug information/incremental artifacts disabled for
available disk capacity. An earlier run overlapped our frontend rebuild with
Rust's embedded-asset doctests; the final build/check sequence is serialized and
passes. Failed attempts remain in the ignored evidence.

Broad real-HTTPS smoke and native planning checks pass, including command recovery,
actual pointer gestures and Chromium touch emulation. All 28 Chromium regression
suites pass including the final Focus fixture rerun. Eleven selected WebKit suites
pass: motion, planning, UI corrections, card calendar, card layout, Focus controls,
editor opening, session, loading, Calendar popup and Focus; UI corrections/popup
pass after their fixture reruns. Raw pointer/key scenarios now wait for actual
native modal removal, focus assertions await restoration, and date-menu helpers
read logical expansion rather than an outgoing painted input. These checks retain
their interaction and persistence assertions.

The new motion suite checks cascade bounds, refresh stability, interrupted
navigation, selection geometry, keyboard/menu reversal, modal focus, live reduced
motion, release CSP and widths 1440/1024/768/390/320. Rendered light/dark and narrow
editor screenshots, plus settled desktop/mobile Focus and sampled mid-motion
surfaces, are inspected. WebKit retains the existing screenshot-injected-style CSP
restriction. Environment: macOS 27.0 arm64, Node 24.11.0, Chromium 153.0.8010.12,
WebKit 26.6, release daemon. No frame-rate benchmark or physical iPhone acceptance
is claimed; full release acceptance remains open.

Generated logs and screenshots are retained in ignored
`test-results/motion-system-2026-10-01/`. Manual-application availability is recorded
after integration and restart.
