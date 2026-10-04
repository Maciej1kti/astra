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

The isolated gate deliberately excludes simultaneous Projects consolidation and
Polish translation edits. Those edits are preserved in the working tree. Final
integration and the existing application's restart verification are pending;
this checkpoint does not claim that the final release has been installed.
