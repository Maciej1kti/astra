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

The shared header stays above every view, including Focus. On phones it remains
opaque and sticky below the top safe area, so its text stays clear while content
scrolls. Project-scoped views choose their project in this header; do not repeat
the selector in view filters.
Projects remains the full workspace overview. Narrow headers retain settings
and refresh buttons, with Git, diagnostics and Sign out in the shared action menu.
Long project names truncate inside the native selector without expanding the page.

List shows cards only and keeps search visible on mobile. Its
secondary filters expand in place; the trigger shows the number of active filters
even when collapsed. Route state remains authoritative across reload and navigation.
Never let a row of selects shrink to unreadable arrows. Workspace toolbar styles
are scoped to `WorkspaceFilters` so they cannot override planning widget controls.

On phones, Calendar places period navigation and date/layout controls in two
compact rows. Its month agenda/grid choice sits just above the dated items;
instructions and the plan/due legend follow the calendar instead of delaying
its content. Board's all-project overview stacks populated statuses vertically.
Within a project, a small status strip jumps between horizontally scrolling
columns and opens on the first column with cards when no position was saved.
Projects uses compact cards with a separate actions menu; deletion remains a
deliberate action in that menu.

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

## Card modal hierarchy

Cards use three persistent header rows: project context with card actions and
Close; a full-width editable title; then status, priority and pin controls on the
left with the save indicator on the right. Saved uses the success color, while
unconfirmed/failed writes remain distinguishable by text and color. The title is
bounded to two visible lines and stays available while the body scrolls. Status
and action menus remain keyboard accessible, with a scrollable status menu on
short screens.

Editor feedback occupies a fourth header row only when there is content. Errors,
field validation, success messages, conflicts, discard/delete prompts and command
recovery controls remain above the independently scrolling form. The feedback
area has a bounded scroll height so lengthy conflict details cannot consume the
whole dialog. Error details lead, repeated field errors are deduplicated, and
older success messages are hidden during errors or confirmation prompts. Local
field descriptions remain available to assistive technology.

Card body order is planning dates, Description, Checklist, Labels, Counters and Comments.
Checklist is a peer section without an enclosing inset panel. Comments start with
the explicit draft and Add comment button, then saved history. Browser comments
use human/Owner attribution without author controls; existing attribution and
CLI/API bot comments remain visible in history. The date-plan and label-entry
helper sentences are omitted from the card form.
