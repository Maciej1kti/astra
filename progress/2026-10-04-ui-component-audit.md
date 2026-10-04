# UI component and interaction audit — 2026-10-04

Audited the existing 63 Svelte components, all 13 native dialogs, all eight
`ActionMenu` instances, shared styles/tokens and pointer adapters. The concurrent
Main project board was inspected for shared-component integration; its feature,
contracts and acceptance remain separately owned. Preserved the owner's existing
Astra card edits. No source/write protocol or product-scope change belongs to this
audit.

## Findings and corrections

| Area | Finding | Result |
| --- | --- | --- |
| Vertical ordering | Focus, card layout, checklist and Timeline duplicated pointer ownership, previews, drop validation and cleanup. | One `reorder-gesture.ts` lifecycle, insertion/keyboard helpers and inert preview cloning; adapters retain their measured geometry and commit rules. |
| Stale drop | Timeline could accept an old order changed immediately before pointerup. | Local order snapshots invalidate on membership/order changes. Focus preserves its frozen preview and captured full membership/version through canonical refresh; release still takes the normal conditional-write conflict path. Filter changes cancel its preview. |
| Preview geometry | A transformed native dialog could interpret viewport preview coordinates relative to its own origin, shifting the checklist ghost and insertion line. | Shared overlay positioning measures the current fixed containing block/scale; all four vertical adapters use it, with a deterministic regression and rendered geometry checks. |
| Gesture cancellation | Different surfaces omitted Tab, orientation, session loss or matching-pointer checks; checklist drops outside the list could commit. | Shared `gesture-cancellation.ts` serves vertical ordering, Board, Timeline dates and counter scrubbing. Checklist bounds include its visible scroll surface. |
| Date proposal identity | A Timeline action update could replace the callbacks used by an already active date gesture. | Date gestures retain the observed proposal and release its original owner; disabled controls cancel pending drops. |
| Menus | Body-relative, floating and auto menus used separate placement logic; clipping, panel growth, alignment and scrolling differed. | Every `ActionMenu` uses one native popover and measured visual-viewport placement, honoring alignment and authored size caps, with shared dismissal/focus. |
| Navigation rotation | An outgoing phone More popover temporarily increased navigation width, selecting horizontal scrolling after rotation to a short desktop layout. | Reveal the active item on the axis of the actual layout, keeping it visible through rotation and menu exit. |
| Modal replacement | Add project → Browse approved folders → Escape lost the original trigger's focus. Feature templates repeated native cancellation. | Registered modal ownership retains return-focus lineage. `modal({ onclose })` routes Escape through the feature's guarded close action. |
| Shared modal layout | Card-project choice placed its main action in the scrolling body; deferred recovery used separate button/footer presentation. | Shared form/body/fixed footer and `Button`; deferred loading still hands off immediately. |
| Narrow controls | At 320px the profile name reduced the folder picker to 116px. Chart shortcuts were 36px tall. | The narrowest header keeps the profile name in the settings tooltip; the picker stays readable. Chart shortcuts consume the shared 44px touch target. |
| Visual constants | Drag previews repeated layer numbers; feedback height and Chart axis typography bypassed tokens. Registration used separate folder/arrow glyphs and a short checkbox label target. | Shared drag-layer/feedback tokens, existing typography token and shared `Icon`/`Button` controls and the 44px checkbox target. |

All dialogs already shared `DialogHeader`, native modal behavior and the common
layout styles before this audit; all actual action menus already composed
`ActionMenu`. The corrections consolidate their lifetime and placement, rather
than introducing a second component library. The newly added Main board also
consumes the shared preview engine, menu and guarded modal primitives.

Native `<details>` in help, recovery, history and exact Chart data are content
disclosures. Tag/folder input already shares `TagPicker`; its combobox suggestions
retain their input-specific keyboard behavior. Calendar overflow and native
Calendar gestures remain widget adapters. Board status targeting, horizontal
counter intent, date resizing and vertical ordering retain their own semantics.
Native buttons needed for DOM actions, segmented controls and inputs still use
the common base styles, icons, focus, motion and touch tokens.

Layout breakpoints, widget dimensions, chart SVG coordinates and gesture thresholds
are intentional structural values. Colors, typography, surfaces, spacing and
shared control/layer dimensions come from the maintained design system. Replacing
every numeric geometry value with a token would not make these different domain
interactions equivalent.

## Verification

Baseline failures are retained in ignored `test-results/ui-audit/` and
`test-results/dialog-components-baseline/`: the 320px responsive picker assertion,
Timeline callback/cancellation regressions, stale Timeline-row pointerup and
registration replacement focus. The rotation failure was reproduced six times
before its layout-axis correction. Regressions also cover swallowed post-drag
clicks, ordinary Focus card opening and transformed native-dialog preview geometry.

Shared UI unit coverage includes 22 ordering/lifecycle/geometry/Focus-adapter tests,
eight date-gesture tests and six popover tests. Focus retains the original
conditional command context while canonical reads refresh; local presentation
orders cancel stale drops. Browser checks use actual pointer/keyboard events and
source readback rather than substituting mock UI writes.

The final integrated local gate passes 598 tests (336 Rust, 255 JavaScript,
seven Python), plus schema/OpenAPI, documentation links, type/format/boundary checks,
Clippy, production build and release build. Initial gzip assets are 81,688 bytes
against the unchanged 81,920-byte budget. An isolated copy of the audit changes on
the prior committed source also passes types/build/budget (81,063 gzip bytes),
confirming the audit does not depend on the concurrent Main feature.

All 35 existing/audit Chromium suites pass across the broad run and final affected
reruns; eleven selected WebKit suites pass. The complete responsive suite has 44
checkpoints, including 320/390/768/1024px, both short landscape sidebars, rotation,
long modal gestures and reduced motion. Its longer sidebar uses bounded real touch
swipes to reach Sign out; native scrolling and final visibility are still required.
Menus and dialogs add replacement/nesting/deferred loading, alignment, short viewport,
content growth, Tab/Escape and focus checks. Final affected evidence uses
`drag-release-*`, `dialog-chromium-final`, `dialog-webkit-final`,
`dialog-webkit-clean`, `menu-axis-*`, `menu-geometry-*`, `responsive-axis-final`
and `registration-ui`. One concurrent WebKit dialog run recorded transient native
cancelled-resource access-control errors; its clean isolated rerun passes with no
page errors and no source filtering. Ignored raw artifacts remain under
`test-results/ui-audit/`.
The broad HTTPS smoke and planning browser workflows pass, including touch hold,
native scrolling, conditional conflict/retry and session cancellation.

Environment: macOS arm64, Node 24.11.0, Rust 1.92.0, Playwright 1.63.0,
Chromium and WebKit. Browser tests use disposable normally paired release hosts
and synthetic sources. Rendered phone/desktop/landscape surfaces are inspected.
Physical iPhone/Safari and complete release acceptance remain open.

## Existing application

Rebuilt the embedded frontend and release daemon and restarted the existing manual
launcher with its original data directory, ports, connection settings and certificate.
Trusted HTTPS at `https://100.122.250.14:47832` returns the new application; all 42
served assets match the built files. The before/after checks preserve all 30 resource
versions, two Focus pins, both user profiles' settings/roots/registrations and the
host identity/epoch and certificate. The initial audit snapshot is retained separately
from the fresh pre-restart snapshot. Rollout artifacts are `manual-at-start.json`,
`manual-before.json`, `manual-after.json`, `manual-restart.json` and
`manual-verification.json`.

The ordinary versioned CLI result report `4650e0bf-d6d8-48ce-b14b-6f6604c64451` is committed and read
back with the exact body/version. No card status, scope, priority or acceptance
was changed.
