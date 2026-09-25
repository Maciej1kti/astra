# Astra UI

The interface uses one small Svelte component set and CSS custom properties. No
additional UI framework, styling runtime or component dependency is required.

## Ownership

- `apps/web/src/styles/tokens.css` owns colors, spacing, typography, radii,
  shadows, control sizes and surface dimensions for light and dark appearance.
- `lib/ui/` owns `Button`, `Badge`, `Icon`, `Brand`, `PageHeading`,
  `SectionHeading`, `EmptyState`, `ResourceCard` and `ResourceMetadata`.
- `styles/base.css` also styles native inputs, selects, textareas and buttons.
  Native controls remain appropriate for DOM bindings and drag actions.
- `styles/workspace.css` owns the responsive shell and workspace layouts;
  `styles/editor.css` and `styles/dialog.css` own editing surfaces.
- Feature components keep structural layout and interaction rules. Their visual
  declarations consume tokens. Workspace screens only compose the shared UI.

Use `Button variant="primary"` for the main action, `quiet` for utility actions
and `danger` for destructive actions. Icons come from `lib/ui/icons.ts`; each
icon is decorative and its control supplies the accessible name. Badges use
semantic state/priority attributes, rather than view-specific colors.

The native checkbox, editable text, remove action and drag handle in the card
checklist remain separate controls. The shared touch target is 44px; visible
icons and checkbox marks can be smaller. Checklist completion never changes a
card's status automatically.

## Layout rules

Desktop has an inset sidebar and white workspace. Mobile has a fixed bottom navigation with a target for every view.
The navigation can still scroll when larger browser text requires more space. Workspace content clears the navigation and floating action.

Card metadata wraps without losing dates, priority, checklist totals or tags.
Calendar, board and timeline overflow stays inside their own surfaces. Calendar
defaults to its existing agenda layout on narrow screens. The native modal
retains focus handling, autosave recovery and keyboard dismissal.

CSS media-query breakpoints and structural proportions are layout rules, not
theme values. `lib/ui/planning-metrics.ts` centralizes numeric dimensions required
by the timeline widget API. Gesture positions are measured from the DOM; they
must not be replaced by fixed design coordinates.

## Review

Review changes in the real application at desktop, 390px and 320px widths.
Use the maintained browser suites for editing, focus ordering, planning,
checklists, tags, dialogs and recovery. Generated concept images are visual
references; source-backed UI behavior and data remain authoritative.
