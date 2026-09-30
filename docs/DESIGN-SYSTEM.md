# Astra UI

The interface uses one small Svelte component set and CSS custom properties. No
additional UI framework, styling runtime or component dependency is required.

## Ownership

- `apps/web/src/styles/tokens.css` owns colors, spacing, typography, radii,
  shadows, control sizes and surface dimensions for light and dark appearance.
- `lib/ui/` owns `Button`, `Badge`, `Icon`, `Brand`, `PageHeading`,
  `SectionHeading`, `EmptyState`, `ResourceCard`, `ResourceMetadata`,
  `DialogHeader`, `EditableTitle` and `ActionMenu`.
  `SectionHeading` supports compact level-three headings, counts and section
  actions; `ActionMenu` can show a text label beside its status icon.
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

Calendar uses a compact period toolbar: its month title opens the shared date
disclosure, with Today and previous/next controls alongside. Layout, month
agenda/grid and scheduled-card creation remain directly available. On phones
these controls occupy two rows; the default month agenda separates date headings,
times and wrapping titles. All seven month columns fit the surface. Overflow
counts open the complete day's list; hourly week columns scroll within the
calendar to retain readable widths. Instructions and the legend follow its content.

Calendar items are flat, without shadows: soft blue timed events, green plans
and warm due markers. Titles lead in hourly views; short events retain at least
one readable title line, while overlapping events use separate columns. Actual
times, durations and editing proposals remain source-owned. The agenda provides
full titles and duration labels, with dividers instead of nested card boxes.
Popovers and controls use the shared motion and reduced-motion rules.

Board's all-project overview stacks populated statuses vertically.
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
left with the save indicator on the right. Status has an icon and visible name;
High priority uses the same warm semantic colors as card priority badges.
Saved uses the success color, while
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

Cards use one reading column for all six sections, with an 800px dialog limit
and a single form scroll surface. Every section can move to any position;
the visual, keyboard and reading order stay aligned at every width. Expanded
schedule fields share one row on desktop and tablet. On phones,
date ranges and event time/duration pairs use two columns when they fit, and a
single column below 360px. Native date/time values must fit without clipping.

Existing cards show Schedule as a single disclosure row: relative time until the
start/end, the inclusive plan day, or a timed event's remaining duration. It uses
the workspace timezone and refreshes while open. Done/cancelled cards show the
planned duration instead of an increasing overdue count. Expanding the row keeps
the existing date/time controls; incomplete edits cannot be collapsed. New card
sessions start expanded and stay expanded through their creation acknowledgement.

The header's Card layout disclosure orders Description, Checklist, Counters,
Comments, Schedule and Labels in one list, without separate groups. Its
44px up/down buttons support touch and keyboard input, announce the new position,
and preserve focus. Keyed sections move their existing DOM and local drafts. The
order applies to all cards in this browser; only known section identifiers are
stored locally, following appearance/board display preferences. Existing grouped
preferences upgrade in their previous reading order. Storage failure
keeps the current layout usable and explains its limited lifetime. Reset restores
the default order. No card or workspace source write is caused by rearranging.
Reordering uses brief FLIP motion; the schedule uses a grid-height transition.
Both respect the current reduced-motion preference, including changes while open.

At phone widths up to 520px, the card dialog fills the viewport and accounts for
safe areas, retaining its persistent header and independently scrolling body.
Other editor dialogs retain their existing centered presentation. Card section
names and heading counts remain available to assistive technology without visible
heading rows. Shared `SectionHeading` keeps action-only rows aligned right;
spacing and dividers separate the self-describing content. Section names remain
visible in the layout menu. Schedule keeps its relative summary when expanded.
Checklist remains a peer section without an enclosing inset panel; each item
retains its separate checkbox, text, remove control and drag handle.

Comments start with a bordered composer and its explicit Add comment action,
followed by saved history. Browser comments use human/Owner attribution without
author controls; existing attribution and CLI/API bot comments remain visible.
The date-plan and label-entry helper sentences are omitted from the card form.


## Compact card counters

Counters share a compact divided list. Each row contains its name, a fourteen-day
bar preview, a value with its unit, and a quiet configuration icon. Desktop places
the preview beside the value; phones place it below the name. The repeated date
and timezone line is omitted. Only a draft for a different day exposes its date.
A right-aligned three-dot menu below the list contains Add counter and Archived.
The next section retains its divider, with compact spacing on both sides of the line.
Archived exposes its pressed state and is disabled when no archived counters exist.
The shared action menu chooses the available space above or below its trigger,
or beside it on short screens, inside the scroll surface. Adding a counter focuses
its configuration field.
There is no visible gesture helper; value controls retain their accessible
gesture/keyboard instructions.

The value uses the pinned counter's horizontal scrub gesture and keyboard steps.
Vertical touch movement scrolls the modal. Tap opens numeric entry in the same
row; Save and Cancel appear only during editing. Incomplete input stays in the
editor draft and blocks submission; autosave and session changes cannot discard
it. Explicit acknowledgement clears that counter's draft and restores value focus.

The mini chart contains confirmed daily totals, with dots for unrecorded days
and short bars for recorded zero. Tapping the name/chart opens the full history
table; rows are rendered only while expanded. Both themes use the shared tokens,
and interaction/disclosure motion respects reduced motion. Inputs and actions
retain 44px targets even when the surrounding layout is compact.

## Pinned daily controls and calendar selection

Pinned cards have a project/status row, a clear title and quiet schedule/checklist/
comment metadata. Daily counters sit below a divider, outside the card-opening
button. The value has a 44px target: horizontal scrubbing follows the configured
step, arrow keys do the same, and tapping opens numeric entry. Vertical scrolling
and cancelled gestures leave totals unchanged. A compact confirmation bar appears
only while editing; one draft stays available across views and filters. Save and
recovery state belong to the cards feature, with the existing command controller.
Long counter names wrap; they take a full row on narrow screens when necessary.

The schedule's Choose dates action opens a small native modal above the card.
Start/end selectors, a six-week grid, today, clear and Apply share existing tokens,
buttons, icons and dialog focus handling. Range bands join selected days; endpoints
and today remain distinct in both themes. Keyboard arrows move days, Home/End move
within a week, and Page Up/Down move months (Shift moves years). All dates are civil
workspace dates, and weekday order follows the workspace preference. Apply enters
the normal editor autosave; Cancel/Escape only closes this local proposal. Typed
native date/time controls remain available. Nested dialog footers do not inherit
the editor form's sticky negative margins. Calendar month fades and counter-bar
entrances respect reduced motion.
