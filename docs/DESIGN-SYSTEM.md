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
- `styles/motion.css` owns surface, disclosure and control effects.
  `lib/ui/motion.ts` owns bounded content cascades, the moving navigation
  selection and live motion preferences; `lib/ui/motion-layers.ts` owns explicit
  heading/content/detail sequences; `lib/ui/dialog.ts` owns native
  modal lifetime and shared layer exits. Durations, easing and distances are
  tokens, with the operating system's reduced-motion setting disabling motion.
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

Desktop has an inset sidebar and white workspace. Mobile has a compact, centered
bottom bar with Focus, Projects and More by default. More opens the remaining
views and browser-local order/visibility controls. The desktop sidebar retains
every view in that order. More always remains reachable, including when all
shortcuts are hidden, and receives the selection highlight for an off-bar view.
The sidebar starts directly with Focus. On short viewports, including landscape
phones, the whole sidebar scrolls vertically so all views and Sign out remain
reachable. Rotation reveals the active view within the new navigation axis.
The bar scrolls when extra shortcuts or larger browser text require more space.
Its floating menu stays within the viewport and scrolls independently in short
landscape layouts. Workspace content clears the navigation and floating action.

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

The main header matches the workspace panel's upper corner radius. Focus pins,
daily plans and events share the same card body; only pins have reorder controls.

Calendar items show the same event/plan/due symbols as their legend and are flat, without shadows: soft blue timed events, green plans
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
Pass `use:modal={{ onclose }}` with the feature's guarded close callback. The
action prevents native Escape dismissal and routes it through that same callback;
do not install a second feature-level `cancel` listener. Its registered modal
order and originating controls preserve focus through nested dialogs, deferred
loading and replacement dialogs, including when the immediate trigger is removed.
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
Every action/date/navigation menu uses the same native popover and
`popover-position.ts` observer. It measures the trigger and visual viewport,
honors start/end alignment, chooses space below/above/beside, bounds long content
and follows scrolling, resizing and expanded content. Feature menus supply their
content and size caps; they do not implement separate positioning or dismissal.
The tag manager opens above settings so closing it returns to the initiating
control. Pending operations retain their existing close restrictions.

Descriptions and tag suggestions defer pointer-driven layout changes until the
click completes. Avoid inserting or removing help text between pointerdown and
click in a centered dialog. Routine autosave does not insert a draft-export
button into the document; recovery controls appear when the draft needs them.

## Pointer previews and ordering

`lib/ui/reorder-gesture.ts` owns the vertical ordering lifecycle for Focus pins,
card sections, checklist items and Timeline rows. Feature adapters capture their
current order and source context, measure their own rows and supply their existing
commit action. Local section/checklist/Timeline ordering cancels when its captured
order changes. Focus keeps its displayed preview frozen through canonical reads
and submits its original full membership/version on release, preserving the normal
conditional-write conflict path. Filter changes cancel that preview. A drop outside
the valid surface only removes the preview. Whole-card
touch surfaces wait for a hold so ordinary scrolling remains available; explicit
grips start when moved. Keyboard order changes retain each surface's documented
shortcuts and use the shared destination helper.

`gesture-cancellation.ts` supplies the same cancellation policy to ordering,
Board movement, Timeline dates and counter scrubbing: matching pointer cancel or
capture loss, a second pointer, Escape, Tab, window blur, orientation and session
loss. Escape cancels the preview before it can dismiss a containing layer; Tab
continues normal focus navigation. Capture transfer from a touched child does
not cancel its new owner. Preview elements are inert, hide from assistive
technology and use shared drag-layer tokens. Shared overlay positioning accounts
for the current origin and scale of transformed native dialogs/popovers, keeping
the preview and insertion line aligned during their entrance.

Board keeps its two-axis status/column targeting, counters keep horizontal intent
and Timeline dates keep date-unit resizing. Native Calendar gestures remain
owned by its widget and adapter. These geometries and source commands are distinct
from vertical list ordering; shared cancellation does not combine their writes.

## Motion vocabulary

Motion uses the existing surfaces, colors and component hierarchy in both themes.
The same selection surface travels between navigation buttons, including after
rapid changes or rotation into the mobile dock. It measures actual button bounds,
retargets from its current position and never receives pointer input.

Loaded views reveal a short cascade of headings and rows. `revealScene` receives
an explicit navigation key and readiness state; refreshes and typing do not replay
an existing scene. At most 24 primary candidates are measured, only onscreen candidates
animate, and primary delays stop at 340 ms. At most 72 small card layers follow
their own surface: context at +60 ms, title +100, metadata +150, labels +200,
attention reasons +220 and daily counter footer +250. These roles cover Focus's
three card sections, Projects, List, workspace Board and project Board. Each
role selects one existing group, so facts and labels cannot consume the footer's
place in a per-card candidate slice. Ordinary surfaces move 6px over 720 ms; section
headings move 4px over 600 ms. The parent view fades in over 200 ms. Entrances
start with zero opacity velocity, gradually materialize and ease into rest.
Surface opacity reaches its endpoint at 80% of eased progress so their details
remain readable through the final settling movement.
Focus drag surfaces, Calendar, Timeline and Board widget surfaces
only fade, preserving their gesture geometry. Inner card layers also keep their
position and size. Board explicitly opts into bounded card children: up to eight
candidates per visible column, 48 measurements and 24 visible card owners. It
shares the 72-secondary-effect limit. Calendar layers its native surface,
weekday header, date grid and event groups at 0/100/160/240 ms; agenda day groups
follow in bounded 45 ms steps. These opacity-only layers start after the current
project/date/layout data is ready, including mobile agenda and month grid.
Project changes start a new sequence; refreshes and source writes do not.
The month overflow popup separately reveals its surface, header and event group
at 0/100/220 ms. Agenda groups start at 180 ms; an empty period uses the same
content entrance. Day and week layouts stage their all-day and timed groups
without moving either group.
Calendar and Timeline retain native event rendering and gesture geometry.
Do not add per-event animations or DOM observers to dense planning widgets.

Native dialogs enter over 760 ms from a 12px offset and 0.992 scale, with a 360 ms
backdrop. The dialog's opacity takes 80% of its duration to emerge gently.
`revealLayers` gives context, title, actions, sections and details separate
timelines, instead of animating the entire body over its animated children.
Dialog context starts at 60 ms, title at 110 ms and its next heading group at
175 ms; header actions start at 140 ms. Card sections follow their visible saved
order from 200 ms in 50 ms steps; the footer starts at 320 ms. Existing tags
follow their own section by at least 120 ms, with 28 ms steps between tags;
the tag pulse is reserved for an explicit add action. Hidden sections
are excluded. Confirmed dismissal has a 220 ms exit; Svelte makes the
outgoing layer inert and the native modal remains present until cleanup. A
node-local presence action mirrors inertness to `aria-hidden`, including reversed
exits, so outgoing controls leave the accessibility tree immediately. Existing
save/discard guards decide whether dismissal is allowed. Focus returns to the
initiating control after removal, without stealing it from a newer modal. Deferred
loading placeholders hand off immediately to the loaded component.

Menus open from their anchored edge with a 3px offset and 0.992 scale, and exit
quickly. Measured floating popovers use the same soft fade while keeping their
placement stable. Menu surfaces precede
their items, and suggestion rows have a short cascade. Page headings, primary
actions and workspace/planning controls also have separate opening steps.
Menu rows start at 100 ms with 36 ms steps; their heading starts at 50 ms and
footer at 260 ms. Suggestions start at 80 ms with 32 ms steps; general control
groups start at 80 ms with 40 ms steps.
Menus, disclosures and control settling take 500 ms; navigation selection takes
520 ms. Headings, card titles, selected tags and suggestion rows resolve from a temporary 2px
blur. Large surfaces, gesture owners, section contents and general control groups
use opacity without blur; no blur remains after completion or cancellation.
Shared buttons compress on
press and settle with the spring easing; navigation icons, pins, priority, chips
and acknowledged save state provide small secondary responses. Hover lift applies
only to fine pointers and excludes draggable Focus cards. Existing drag transforms
remain owned by their gesture implementation.

### Shared parameters

[Token definitions](../apps/web/src/styles/tokens.css) are the implementation
source of truth. Durations below exclude a layer's opening delay. Use the same
parameters in light/dark themes and desktop/mobile layouts.

| Token | Current value | Purpose |
| --- | --- | --- |
| `--motion-quick` | 200 ms | Control colors and the parent view fade |
| `--motion-enter` | 500 ms | Menus, disclosures and control settling |
| `--motion-heading` | 600 ms | Headings and card titles |
| `--motion-content` | 640 ms | Local sections and native Calendar groups |
| `--motion-detail` | 480 ms | Metadata, labels, counters and confirmation |
| `--motion-backdrop` | 360 ms | Dialog backdrop |
| `--motion-dialog` | 760 ms | Dialog surface |
| `--motion-scene` | 720 ms | Loaded rows and surfaces |
| `--motion-selection` | 520 ms | Moving navigation selection |
| `--motion-exit` | 220 ms | Confirmed dismissal |
| `--motion-stagger` | 52 ms | Bounded scene steps |
| `--motion-distance` | 6px | Ordinary scene travel; gesture surfaces override with zero |
| `--motion-softness` | 2px | Temporary blur on selected small layers |
| `--motion-lift` | 2px | Fine-pointer hover lift on eligible cards |

Entrances use `--motion-emerge: cubic-bezier(0.32, 0, 0.24, 1)`, whose initial
slope is zero. Layout/hover transitions use `--motion-ease` with
`cubic-bezier(0.22, 0.61, 0.36, 1)`; interactive settling uses `--motion-spring`
with `cubic-bezier(0.28, 0.75, 0.32, 1.04)`. Press feedback starts immediately, before
the softer release. Adjust the shared curve and layer ownership when tuning an
entrance: a longer duration alone does not prevent most movement being consumed
in its first frames or while a parent is still invisible.

### Extending the system

| Surface | Owner and integration |
| --- | --- |
| Loaded Focus, Projects, List, Updates and workspace Board | `revealScene` on the view; visible card roles follow their surface |
| Project Board | Feature-owned scene with `cardSelector`; columns and inner card groups retain native drag geometry |
| Calendar | `calendar-motion.ts` supplies `revealLayers` with current-page readiness and project/date/widget-view keys; popup layers stay in `CalendarView` |
| Timeline | Feature-owned `revealScene` on the native chart with zero travel |
| Page headings, dialogs, menus, suggestions and toolbars | `revealLayers` with explicit local selectors and opening keys |
| Navigation, shared controls and disclosures | Shared motion actions and `styles/motion.css`; no feature-specific replacement |

Local sequences consider at most 16 candidates per layer descriptor and start at
most 32 visible effects per opening/navigation key, with delays capped at 560 ms.
This effect limit is distinct from the number of candidate measurements.
No persistent observer or per-event widget
animation is added. General control groups, draggable content and metadata only fade;
their gesture geometry stays fixed. Refreshing source data, editing a draft or
adding a tag does not replay the other layers. Cleanup cancels pending frames
and effects, and reduced motion applies to every layer.

Feature code supplies selectors for existing semantic groups rather than adding
animation-only wrappers. Use a key for the selected resource, view or period;
exclude draft values, source versions and refresh counters. Set `ready` only when
the current selection's content is rendered. A pending frame cancelled before
readiness must not consume the opening key. Use `distance: "0px"` on gesture
owners, and `soften: false` when a heading layer covers a large native grid.

The `afterParent` option schedules details at least 120 ms after their selected
parent starts, subject to the sequence's 560 ms delay cap; it does not wait for
that parent's whole animation to finish.
Use `soften: true` only on bounded small groups such as suggestions. The default
heading role resolves from blur; content and detail roles do not blur unless
explicitly opted in. Prefer these actions to untracked timers or global DOM scans.

`--motion-softness` is reserved for the bounded small layers above; never apply it
to a whole view or widget. Effects must not
own data, delay requests, gate input, replay on autosave or install permanent
compositing hints. The system reduced-motion preference removes CSS effects,
cancels shared Web Animations and completes Svelte transitions already in flight.
This also applies when the preference changes while a dialog is open.

Check actual intermediate frames, settled sharpness, fast navigation and source
refresh stability. Exercise keyboard/touch and native drag/resize with motion
enabled, then change Reduce motion during an entrance. Raw background-pointer
tests must wait for native `dialog[open]` removal, because an outgoing modal leaves
the accessibility tree before native close. See the
[focused browser commands](../scripts/browser/README.md#motion-verification) and
[verified rollout](../progress/2026-10-01-soft-motion.md) for evidence and limits.

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
44px six-dot handles support pointer dragging and Arrow/Home/End keys, announce
the new position and preserve focus. Like Focus, a drag shows a floating preview
and insertion line, committing order only on release. Escape, cancellation and
loss of focus discard the preview. Short panels scroll during dragging. A native
popover keeps the menu and preview above dialog clipping when the body shrinks,
including when all sections are hidden. Keyed sections retain their DOM and drafts. The
order applies to all cards in this browser; only known section identifiers are
stored locally, following appearance/board display preferences. Existing grouped
preferences upgrade in their previous reading order. Storage failure
keeps the current order usable and explains its limited lifetime. Rearranging
does not write card or workspace source.

A 44px eye control on each row toggles that section's visibility. Shown sections
use the accent eye; hidden sections have a muted label and crossed-out eye. All
rows stay in the menu, so hiding everything remains reversible. Visibility is
saved for this card across devices through ordinary autosave. Hidden controls
remain mounted but inert and outside the accessibility tree; visible sections
alone determine dividers and spacing. Reset restores the browser order and shows
every section on this card. Reordering uses brief FLIP motion; hiding uses a
grid-height transition. Both respect reduced motion, including changes while open.

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

The workspace Chart view has its own counter catalog and analysis surface in
`features/charts`. A desktop catalog sits beside the plots; on narrow screens
it follows the statistics and precedes the plots in one column. Date, grouping
and scale controls wrap without horizontal page overflow. Raw quantities share
a plot only when their units match; relative and configured-value modes have
explicit axis labels. Series colors apply consistently to catalog swatches,
plots, inspection values and comparison rows in both themes.

Each plot provides a keyboard/touch date slider and an expandable exact-value
table. Gaps preserve unrecorded dates, while recorded zero has a visible point.
Grouping labels show recorded-day coverage. Browser-local rates and selections
are separate from the source-read lifecycle, so acknowledged source changes
refresh data while preserving the chosen analysis.

Counters share a compact divided list. Each row contains its name, a fourteen-day
bar preview, a value with its unit, and a quiet configuration icon. Desktop places
the preview beside the value; phones place it below the name. The repeated date
and timezone line is omitted. Only a draft for a different day exposes its date.
A right-aligned three-dot menu below the list contains Add counter and Archived.
When the card has no counters, a direct Add counter button occupies the same
right-aligned action row. Cards with archived counters retain the menu so their
history remains reachable.
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
