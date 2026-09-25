# Astra UI

The interface uses one small Svelte component set and CSS custom properties. No
additional UI framework, styling runtime or component dependency is required.

## Ownership

- `apps/web/src/styles/tokens.css` owns colors, spacing, typography, radii,
  shadows, control sizes and surface dimensions for light and dark appearance.
- `lib/ui/` owns `Button`, `Badge`, `Icon`, `Brand`, `PageHeading`,
  `SectionHeading`, `EmptyState`, `ResourceCard`, `ResourceMetadata`,
  `DialogHeader`, `EditableTitle` and `ActionMenu`.
- `styles/base.css` also styles native inputs, selects, textareas and buttons.
  Native controls remain appropriate for DOM bindings and drag actions.
- `styles/workspace.css` owns the responsive shell and workspace layouts;
  `styles/editor.css` and `styles/dialog.css` own editing surfaces.
- `styles/motion.css` owns entrance and interaction motion. Durations, easing
  and distances are tokens, with the operating system's reduced-motion setting
  disabling animations and transitions.
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
The sidebar starts directly with Focus. On short viewports, including landscape
phones, the whole sidebar scrolls vertically so all views and Sign out remain
reachable. Rotation reveals the active view within the new navigation axis.
The navigation can still scroll when larger browser text requires more space. Workspace content clears the navigation and floating action.

Card metadata wraps without losing dates, priority, checklist totals or tags.
Calendar, board and timeline overflow stays inside their own surfaces. Calendar
defaults to its existing agenda layout on narrow screens. The native modal
retains focus handling, autosave recovery and keyboard dismissal.

List shows cards only and keeps project and search visible on mobile. Its
secondary filters expand in place; the trigger shows the number of active filters
even when collapsed. Route state remains authoritative across reload and navigation.
Never let a row of selects shrink to unreadable arrows. Workspace toolbar styles
are scoped to `WorkspaceFilters` so they cannot override planning widget controls.

CSS media-query breakpoints and structural proportions are layout rules, not
theme values. `lib/ui/planning-metrics.ts` centralizes numeric dimensions required
by the timeline widget API. Gesture positions are measured from the DOM; they
must not be replaced by fixed design coordinates.

## Review

Review changes in the real application at desktop, 1024px, 768px, 390px and 320px widths.
Use the maintained browser suites for editing, focus ordering, planning,
checklists, tags, dialogs and recovery. Generated concept images are visual
references; source-backed UI behavior and data remain authoritative.

## Dialogs and direct editing

All dialogs use the native `modal` action, a shared `DialogHeader`, and
`dialog-body` / `dialog-footer` layout classes. The header and footer stay in
place while long content scrolls. Dialog widths, padding, controls and responsive
spacing are shared; individual features only own their content layout.
Dialog content scrolls vertically, with horizontal gestures contained and long
text, code and table cells wrapping. Pinch zoom remains available. The document
behind a modal is locked until it closes.

`EditableTitle` is the single title field and visible heading. It wraps long
text, preserves a single-line stored value, accepts keyboard input and finishes
editing on Enter. Card and project autosave remains owned by the editor.
Escape continues through the existing close and unresolved-draft guards.

`ActionMenu` is a small keyboard-accessible disclosure, with ordinary buttons and
checkboxes. Card pinning stays in the header; archive and permanent deletion are
inside its actions. Escape dismisses the disclosure and restores trigger focus.
The tag manager opens above settings so closing it returns to the initiating
control. Pending operations retain their existing close restrictions.

Descriptions and tag suggestions defer pointer-driven layout changes until the
click completes. Avoid inserting or removing help text between pointerdown and
click in a centered dialog. Routine autosave does not insert a draft-export
button into the document; recovery controls appear when the draft needs them.

Entrances use a brief fade and small vertical movement, without delaying input.
View motion runs on navigation, not on each data refresh or keystroke. Card hover
lift applies only to fine pointers and excludes draggable Focus cards; existing
drag transforms remain owned by their gesture implementation.
