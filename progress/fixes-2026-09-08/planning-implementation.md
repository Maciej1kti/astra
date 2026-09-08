# Planning audit fixes — implementation batch, 2026-09-08

Status: implemented and verified in the final integrated browser phase requested
by the owner. No build, unit suite or browser test was run during the initial
implementation batch. The final custom planning run passed all its assertions
and produced seven screenshots; see
[browser results](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/planning-browser/results.json) and
[visual review](planning-visual-review.md). The previous audit's screenshots and
failures remain the baseline evidence.

## Changes

- **A05, populated month height:** EventCalendar receives an explicit bounded
  month height (600–820 px on desktop; 740 px for an explicitly selected phone
  grid). Its supported `dayMaxEvents: true` option now has a finite cell height
  from which to calculate real `+N more` overflow. Empty weeks no longer inherit
  the full content height of the busiest week. Overflow opens the library's
  keyboard-accessible day dialog, with larger close targets and wrapping titles.
- **A05, phone readability:** at widths up to 720 px, Month opens a bounded
  whole-month agenda with wrapping titles. The user can explicitly switch to a
  month grid within its horizontal scroll region. This changes presentation,
  preserving the selected month and navigation unit. Day, Week and Agenda remain
  explicit selectable layouts. Toolbar controls fit into two mobile rows.
- **A06, navigation:** `DateViews` and `CalendarView` accept the route-owned
  `calendarDate`, `calendarLayout`, `workspaceToday`, and `onCalendarNavigate`
  interface. Date input, layout changes, arrows and keyboard navigation emit
  controlled navigation intents. There are no independent stale date/layout
  copies inside the calendar; external reload/Back/Forward state is authoritative.
  `App.svelte` integration is owned by the root agent.
- **A12, workspace Today:** Today navigation uses the workspace date provided by
  the application. Day labels and the visual Today treatment use that same date;
  the widget's browser-local Today highlight is neutralized. Strict date parsing
  prevents malformed native date input from entering navigation or creation.
- **Mobile Gantt identity:** a compact title column remains visible at the
  initial horizontal position. The card selector and its full-title/date/deadline
  summary sit above the chart, outside horizontal scrolling. Selecting an item
  brings its task into the chart viewport. Selecting gesture/link targets also
  updates the identity summary. The existing workaround for SVAR's compact
  readonly renderer remains; the chart can still scroll horizontally internally.
- **Planning context:** changing Gantt project clears stale selection/dependency
  form choices. A resource refresh retains the current Gantt page when its cursor
  is valid. If the projection changed and the server returns `CURSOR_STALE`, the
  view reloads the first page with an explicit status notice; the backend cursor
  contract does not permit reusing the old page cursor after a revision. Timeline help
  is progressively disclosed, and the project timing and toolbar spacing are
  compacted without removing forecast coverage or incomplete-analysis warnings.

## New regression coverage

- `scripts/tests/planning-navigation.test.mjs`: month/year/leap transitions,
  strict input rejection, timezone-independent whole-day navigation, and compact
  month/list view selection without changing week/day/agenda semantics.
- `progress/fixes-2026-09-08/planning-browser-checks.mjs`: exported fixture helper
  for bounded desktop/month/mobile height, keyboard overflow access, route reload
  and Back/Forward, workspace Today (run in a Honolulu browser context), optional
  grid access and stable full selected-card identity during horizontal scrolling.
- `progress/fixes-2026-09-08/planning-check-runner.mjs`: authenticated synthetic
  host runner with Honolulu timezone, actual saved timeline title lookup,
  first/last unobscured agenda-event checks and page/console/CSP/network telemetry.
  Its final recorded run passed with no unexpected browser or network errors.
- Run the existing planning gesture suite after integration. It must continue to
  cover move, both resize edges, keyboard, Escape/multipointer cancellation,
  version conflicts, dependency validation and read-only forecast behavior.

## Widget adapter dependencies and limits

The implementation was checked against the installed primary sources:
`@event-calendar/core` 5.12.2 README `dayMaxEvents`,
`src/plugins/day-grid/{View,Event,Day,Popup}.svelte`, and
`src/plugins/list/index.js`. The library supports only boolean day overflow;
it hides stacks by measured day height and includes `listMonth` as a supported
view. CSS uses `.ec-day`, `.ec-day-foot`, `.ec-popup` and list/grid classes.

Gantt retains the existing `@svar-ui/svelte-gantt` 2.7.2 minimum renderer width
workaround. The title column is not claimed to stay fixed while the outer chart
is horizontally panned; the full selected-item summary does stay outside that
scrolling surface. CSS compact title wrapping uses widget `.wx-cell`, `.wx-text`
and `.wx-toggle-placeholder` classes. Recheck these adapters on dependency upgrades.

No API/schema, saved scheduling contract, CSP or TLS policy was changed. No
physical iPhone verification is claimed. The selected project folder has no
`.project` metadata; this batch does not initialize any.
