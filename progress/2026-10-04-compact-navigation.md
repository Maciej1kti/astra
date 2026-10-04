# Compact customizable navigation — 2026-10-04

Baseline: `b9edce1`, with concurrent trusted-profile changes preserved in the
working tree. The owner requested a shorter bottom bar, a three-dot disclosure
for the remaining views, earlier/later ordering and control over bar visibility.

Phones now start with Focus, Projects and More. More opens off-bar views and
Customize navigation, whose arrows reorder all seven views and whose eyes toggle
their shortcuts. More remains available with every shortcut hidden and marks the
selected off-bar view. Reset restores the defaults. Presentation is stored in the
browser; project sources, routes and server preferences are unchanged. Desktop
keeps every view in the chosen order and exposes the same customization.

The floating panel respects viewport bounds and scrolls in short landscape views.
The obsolete 360px full-width inset override is removed so it cannot displace the
centered bar. Navigation motion measures nested More correctly and follows order
changes without replacing the mounted active button. Earlier/later controls
retain row focus, expose boundary states and announce changes.

Verification:

- The combined full gate passes 313 Rust, 174 JavaScript and seven Python tests
  (494 total), contracts, documentation links, formatting, clippy and release build.
  Early attempts observed a concurrent clippy correction, formatting in progress
  and a shared frontend-build race; the final gate passes.
- The new release-daemon `navigation` suite passes in Chromium and WebKit.
  It checks default/overflow navigation, ordering, visibility/reload, all-hidden
  recovery, keyboard dismissal/focus, touch controls, reduced motion, 320/390px
  bounds, 640×320 landscape, desktop rotation, all-visible scrolling, selection
  geometry after reorder and malformed/duplicate browser preference recovery.
  No application errors or CSP violations occur. Settled Chromium layouts are
  inspected; WebKit runs without screenshot preparation.
- Chromium and WebKit `motion` pass. Chromium `dialogs` passes all seven scenarios;
  `card-layout` and the broad HTTPS smoke pass. The smoke retains active native
  modal scoping and uses More for mobile route changes.
- The broader `responsive` attempt stops at a concurrent profile-header issue:
  the 320px Folder picker measures 116.16×44px against its existing 130px width
  requirement. Its threshold is preserved. Dedicated navigation and motion
  checks verify the corrected 320px bar independently; no full responsive-suite
  pass is claimed.
- The embedded frontend and release daemon are rebuilt; the existing manual app
  is restarted at `https://100.122.250.14:47832`. Trusted HTTPS verifies all 32
  served assets. All 25 pre-restart resource versions, workspace settings,
  certificate, instance and command epoch are preserved. Host/index are ready
  with zero source issues or pending commands. The ordinary project report is
  appended through the CLI and read back separately after rollout.

Reproduce with the commands in [browser coverage](../scripts/browser/README.md):

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs navigation motion dialogs card-layout
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs navigation motion
ASTRA_TEST_PROFILE=release node scripts/browser-smoke.mjs
```

Routine logs, manifests and screenshots remain in ignored `test-results/` under
`navigation-*` and `browser/navigation-*`. Browser touch emulation is not a
physical iPhone test; platform and release acceptance remain open.
