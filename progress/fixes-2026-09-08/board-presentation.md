# Board and shared resource presentation fixes

Date: 2026-09-08. Implementation pass; integrated tests and browser verification
are deliberately deferred until the bulk fixes are complete, as requested by the
owner. No build, helper test or browser test was run in this subtask.

## A11: Content Security Policy violation

The pinned `@svar-ui/svelte-kanban` 2.6.0 Willow component delegates to
`@svar-ui/svelte-core` 2.6.0. The installed primary source at
`node_modules/@svar-ui/svelte-core/src/themes/Willow.svelte:10` renders
`<div class="wx-theme wx-willow-theme" style="height:100%">` when children are
provided. `Board.svelte` previously used this wrapper. The audit recorded a
`style-src-attr` violation whenever Board mounted, while Timeline already loaded
the Willow stylesheet without using that wrapper.

Board now mounts `<Willow fonts={false} />` without children and places Kanban in
a local `board-theme wx-theme wx-willow-theme` element. A compiled stylesheet sets
its height. The explicit `wx-theme` Svelte context is retained for descendant
portals. The pinned library, theme stylesheet, fonts-disabled behavior, widget
store and gesture adapter are preserved. CSP and transport/authentication settings
are unchanged; no dependency files were patched.

This source trace identifies a concrete inline-style source. It does not establish
that the earlier warning caused a drag defect or that every possible library
feature is free of inline-style paths. The integrated browser pass must check the
actual Board mount and drag/collapse paths under the release CSP.

## Presentation changes

- Board columns use the existing muted surface token while cards retain the panel
  surface and gain a complete border. Hover and keyboard focus have distinct card
  boundaries in both themes. Icons use the application foreground instead of a
  vendor-only muted color.
- Collapse, expand and header-add controls have 44 px touch targets; collapsed
  columns provide the same minimum width.
- Board error feedback now offers Reload board. Initial loading and background
  busy state are exposed, and an empty local filter explicitly describes the
  loaded-page scope.
- Cancelled starts collapsed for a new project/browser preference, as required by
  the product specification. A saved explicit expansion remains respected.
- `ResourceMetadata.svelte` centralizes noninteractive metadata for Board and other
  summary surfaces: readable status, non-default priority with a symbol and text,
  visible blocker reason, archive state, separate hard deadline/target date/plan/
  review meanings and literal tag chips. Long tags wrap without splitting names.
- Priority and blocked styles use existing notice tokens, review uses the existing
  review surface, and active/done use the planning surface. No competing token
  system or protocol/domain field was introduced.
- Board cards keep one whole-card action and the existing drag/keyboard behavior.
  The shared metadata contains no nested buttons, links or form controls.

Shared component interface:

```ts
{ item: Summary; showStatus?: boolean; compact?: boolean }
```

`showStatus` and `compact` default to false. The component does not render the
resource title. `resource-presentation.ts` exports `resourceLabel` and
`resourceDates` for reuse. Full tag vocabulary/management and a complete card
inspector remain separate work; these display changes do not claim completion of
those product requirements.

## Deferred checks

Helper coverage was added in `scripts/tests/resource-presentation.test.mjs` for
the simultaneous representation of a hard deadline, a different plan and a review
date, and for target-date/single-day-plan behavior. `board-view.test.mjs` includes
default-collapsed versus explicit-expanded Cancelled preferences.

The integration owner should verify:

1. Type checking and all helper tests after the bulk changes settle.
2. No Board `style-src-attr` event under the real release response headers, with a
   violation listener installed before navigation; its `.wx-theme` wrapper should
   have no style attribute.
3. Whole-card mouse drag, touch hold-drag, normal touch scrolling, both-axis
   autoscroll, Escape cancellation, keyboard reorder and versioned conflict paths
   using the existing browser smoke suite.
4. Collapsing/expanding and remembered scroll/preferences after navigation/reload.
5. Populated light/dark desktop/narrow screenshots with long tags, a long blocker,
   urgent/low priority and simultaneous deadline/plan/review dates. Confirm no
   document overflow and inspect visible focus and boundaries.

The checkout contains no `.project/README.md` or `.project/project.md`; no project
data was initialized or written. No commits or pushes were made in this subtask.
