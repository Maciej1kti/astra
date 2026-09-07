# Gantt and calendar library assessment

Research date: 2026-09-07. Recommendation only; no dependency adoption,
implementation, performance acceptance, or physical-device verification.

## Recommendation

Evaluate **SVAR Svelte Gantt (MIT)** and **EventCalendar by vkurko (MIT)**.
This independently supports the candidates already named in
`docs/08-UI-AND-INTERACTIONS.md`. FullCalendar Standard is the calendar fallback.

The application is a Svelte 5 / TypeScript / Vite SPA served by Rust, with
existing date projections and versioned write transport. The current working
tree also contains SVAR Kanban integration changes, which this research does not
modify. Both recommended widgets fit as local frontend dependencies without a
new backend or runtime service.

## Candidates and tradeoffs

| Candidate | Relevant capabilities | Assessment |
| --- | --- | --- |
| [SVAR Gantt](https://github.com/svar-widgets/gantt) | Native Svelte 5, TypeScript, dependencies, configurable scales, virtualization, themes; MIT core | First Gantt candidate. Keep Astra's unscheduled section and undo: built-in unscheduled tasks and undo/redo are PRO. Auto-scheduling is PRO and outside Astra's requirements. |
| [EventCalendar](https://github.com/vkurko/calendar) | Native Svelte 5, DayGrid month/week, List agenda, drag/resize, long-press controls, CSS theming; MIT | First calendar candidate. The native snippets and event-specific editability fit separate schedule/deadline/review items. Resource timelines are also MIT, but do not replace Gantt dependencies and milestone semantics. |
| [FullCalendar](https://github.com/fullcalendar/fullcalendar) | MIT standard calendar; documented touch editing; mature ecosystem | Strong fallback using a JavaScript lifecycle wrapper in Svelte. [Timeline/resource plugins are Premium](https://fullcalendar.io/docs/premium). |
| [SVAR Calendar](https://github.com/svar-widgets/calendar) | Native Svelte, MIT day/week/month and drag/resize; matching UI family | Attractive visual consistency, but built-in Agenda is PRO. Astra requires agenda and an all-day week, so the free edition needs extra integration work. |
| [Frappe Gantt](https://github.com/frappe/gantt) | MIT, configurable SVG Gantt with dependencies | Alternative for simpler desktop timelines. Inspected drag code uses mouse events, making touch work a material risk. Its dependency movement must be disabled for Astra. |
| [Schedule-X](https://github.com/schedule-x/schedule-x) | Modern calendar with Svelte integration | Do not choose current v4 for the requested OSS editing scope: [drag/drop and resize moved to Premium](https://schedule-x.dev/blog/schedule-x-v4). Older free packages do not establish support for current releases. |

Snapshot from GitHub API and npm metadata: EventCalendar release v5.12.2 on
2026-09-03, approximately 2.3k stars; FullCalendar v7.1.0 on 2026-09-05,
approximately 20.6k stars; SVAR Gantt npm 2.7.2, MIT, approximately 257 stars,
repository pushed 2026-09-01; SVAR Calendar npm 2.6.0, approximately 57 stars.
These are activity signals, not acceptance evidence. The raw SVAR Gantt and
EventCalendar license files were also read and identify MIT. Some repositories
have no latest GitHub release endpoint; absence is not evidence of abandonment.

## Integration boundary

- Replace the rendering inside `apps/web/src/lib/DateViews.svelte` with separate
  lazy-loaded adapters. Preserve `DateProposal`, `DateChange.svelte`, the shared
  editor and existing server queries/commands.
- SVAR's [intercept API](https://docs.svar.dev/svelte/gantt/api/methods/intercept/)
  can block actions and its default editor. Route mutations to Astra proposals;
  do not wire its generic REST provider directly to the application.
- EventCalendar documents `eventDrop`, `eventResize` and `revert`. Capture the
  proposed change, restore the confirmed projection, and open Astra's proposal
  flow. Verify reverting either resize boundary in the pinned package.
- Use the source version captured for the gesture. Preserve request ID, epoch
  and payload on uncertain retries. Defer SSE projection replacement during a
  gesture, then reconcile without overwriting a conflicting resource.
- Keep all-day strings canonical. Explicitly adapt each widget's end-date
  convention and test one-day ranges, both resize boundaries, month/year
  rollover, leap dates, DST and clients in different timezones. Never derive
  canonical dates through UTC ISO conversion of browser-local Date objects.
- Calendar event identity is `item_id`, not only the card ID. Only schedule
  items get schedule drag/resize; due and review markers retain distinct
  semantics. Use DayGrid week rather than an hourly TimeGrid.
- Gantt milestone rows are supported by the task type API. Preserve separate
  due indicators, unscheduled cards, and dependency warnings outside the page.
  Do not add automatic movement of successors or hide missing edge targets.
- Render untrusted titles as text/Svelte snippets. Keep assets local and verify
  the current CSP; no CDN, external fonts, or remote event feeds are required.

## Evidence required before adoption

Build and inspect actual release chunks, including overlap with the currently
selected Kanban dependencies. SVAR packages use differing transitive versions;
one vendor does not guarantee deduplication. Keep the initial JS/CSS budget
separate from lazy calendar/Gantt chunks.

Exercise 200 and 500 Gantt rows, 1000 calendar items, pagination and dense
dependencies; record responsiveness and memory rather than repeating vendor
benchmark claims. Verify conflicts, uncertain writes, SSE during drag, and
unchanged deadlines when moving schedules.

Test keyboard alternatives, focus, screen-reader result announcements, zoom,
dark/light themes and reduced motion. Test physical iPhone Safari for scrolling,
selection/handles, resize, cancellation, second pointer and orientation changes.
Documented touch support alone does not prove the repository's specific gesture
contract. No browser/device or integrated bundle benchmarks were run for this
research-only result.
