# Shared navigation and card section selector

The owner identified a gap in the earlier UI audit: Customize navigation still
used separate up/down buttons while the card section menu used a six-dot grip.
Both now render `lib/ui/OrderVisibilityList.svelte`; feature wrappers retain only
their order, labels, persistence and visibility callbacks. The former editor-only
gesture and duplicate navigation row styles are removed.

The common list owns grip/eye rows, muted hidden labels, 44px controls, keyed
motion, accessible help/status and retained handle focus. Its generic gesture
owns mouse/touch previews, auto-scroll, stale-order validation, keyboard
ArrowUp/Down/Home/End and cancellation. Previews are inert, preserve the component's
scoped styles and use the native owner's top layer. Navigation customization
loads from More and mounts its list only while the disclosure is expanded.
Navigation order/visibility remains browser-local; card visibility retains the
existing conditional source write and draft guards.

Browser verification also reproduced a shared popover defect: a centered card
modal grew after showing a section, moving the next eye between pointerdown and
pointerup. Placement now remains fixed for an internal primary pointer press and
catches up after click dispatch. Pointer cancellation, blur, orientation changes
and action cleanup release the hold.

## Verification

The independent English source snapshot based on `d591a63` passes the full local
gate: 336 Rust, 269 JavaScript and seven Python tests (612 total), schema/OpenAPI,
package/documentation checks, types, boundaries, formatting, Clippy, frontend and
embedded release builds. Initial JS/CSS is 81,914 bytes gzip against the unchanged
81,920-byte limit. The 41 focused tests include six new generic-list regressions
and five new popover regressions; the held-press regression fails against the
previous popover implementation.

Release Chromium and WebKit pass navigation (12 groups), card layout (17 groups)
and shared menus (six groups each). They exercise real daemon pairing, mouse
ordering, aligned inert previews, Escape/Tab/outside cancellation, keyboard
bounds/Home/End/focus, visibility, reload/reset/storage failure, scrolling and
320–1024px viewport changes. Chromium additionally dispatches touch drag/commit
and cancellation; WebKit covers touch navigation/eyes and keyboard ordering.
Rendered 320px card/navigation, dark card and active-drag results were inspected.
All application-error and CSP collections are empty.

Ignored evidence lives in `test-results/navigation-grip/final-full-gate.log`,
`final-{chromium,webkit}/`, `final-menus-{chromium,webkit}/` and their suite logs.
The original arrow-control failure and raw missed-eye press are retained there.
Browser emulation does not establish physical iPhone/Safari acceptance.

## Integration and existing application

The independent snapshot excludes simultaneous Projects consolidation and Polish
translation edits. The integrated eight-view source is now committed at
`0e55703`: all 424 application, contract, build and test files match the tested
snapshot. Its complete check set passes 615 tests (339 Rust, 269 JavaScript,
seven Python), types, format, boundaries, schema/documentation checks, Clippy,
frontend and embedded release builds. Initial JS/CSS is 81,683 bytes gzip.
Two CLI socket-mock tests initially returned `WouldBlock`; an unchanged retry of
the complete CLI/daemon crates passes. No source or test bounds were changed.
The initial failure and successful continuation remain in
`test-results/projects-rollout/isolated-{gate,rust-retry,release}.log`.

Integrated release Chromium and WebKit pass navigation, card layout and menus
again; Chromium passes 40 responsive checkpoints. All application-error and CSP
collections are empty. Evidence is in `test-results/navigation-grip/integrated-*`,
including the committed-source equality manifest and check summary.

The embedded frontend and release daemon are rebuilt, and the existing manual
app is restarted at `https://100.122.250.14:47832` with its original data folder,
ports, certificates and connection settings. Trusted HTTPS returns the verified
release; all 46 served assets match the integrated build. All 35 pre-existing
resource versions, two pins, both user profiles' preferences/roots/registrations,
identity/epoch and certificate are preserved.

A normally paired live browser confirms eight shared grips and eight eyes, no
arrow controls, keyboard ordering/focus, visibility, reset and bounded 320/390px
surfaces. Rendered output was inspected; no application errors were recorded.
Ignored runtime evidence is in `test-results/navigation-grip/rollout/`.
Pending Polish translation and definition-cleanup source changes are preserved.
Physical-device and full release acceptance remain open.
