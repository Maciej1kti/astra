# ADR-075 — Timeline drawn by Astra, with date gestures saved on release

Status: accepted on the owner's 2026-10-08 direction.

Timeline rendered through SVAR Svelte Gantt, configured read-only, with
Astra's own handles inside each task and a selection bar above the chart
(choose an element, open it, edit its planned dates). Every move or resize
opened a dialog to confirm dates the gesture had already shown. The owner asked
for the view to be rebuilt: no selection bar, cards without dates above the
axis, weekends visible, fluent movement, a gesture that saves what it shows, and
a bar that opens its card.

## Decision

`features/planning/GanttView.svelte` draws the timeline itself: a scrolling
surface with a fixed header and title column, bars as ordinary elements placed
by day arithmetic (`timeline-scale.ts`), and three scales. `@svar-ui/svelte-gantt`
and the packages only it needed are removed; the Board still uses SVAR Kanban.
The earlier choice of that renderer in [the ADR log](12-ADRS.md) is superseded
for Timeline. Its reasons no longer held: the widget's editing, compact mode
and theme wrappers were all bypassed, and what remained could not shade
weekends, keep a title column fixed on a phone or move a bar between days.

A release of a move or resize is proposed at once through the existing
`DateChange` automatic submission that Calendar gestures use. The dialog
appears only when the save was refused, is uncertain or the session ended, with
the same recovery controls as before. A click on a bar opens the card.

The view never chooses a version for the user:

- A change is proposed against the version its row showed when the gesture
  ended. Reads are deferred while a bar is held, so that is the version the
  gesture began with.
- A further change to the same row made before the saved row has been read is
  proposed against the version this browser's own save returned. If that save
  is still on its way, the later dates wait for its answer; if it is refused,
  they are dropped with it.
- A version that merely arrived with a later read is never substituted. A card
  changed elsewhere therefore still ends in the normal conflict, and the bar
  returns to its saved days.

`timeline-pending.ts` holds these rules without the DOM and is unit tested.
`DateChange` now reports the version its command produced to the view that
proposed it; nothing else about the command changed.

## Consequences

- No protocol, schema, source or command change. A date change is the same
  conditional `PATCH` with the same request identity and retry rules.
- There is no confirmation step, so an accidental drop is saved. Movement must
  pass a threshold, Escape cancels, and on touch a bar moves only after a hold,
  so that a swipe scrolls instead.
- The manual date form is no longer reachable from Timeline. It remains for
  Calendar keyboard date editing and as the recovery surface.
- The month field leaves the page filter; the view's toolbar navigates. The
  `month` route parameter is unchanged and the axis extends around it instead of
  being limited to it. Rows more than 18 months from the requested month are
  not drawn; their row offers a jump to them.
- The lazily loaded Timeline chunk no longer carries the widget, its grid and
  `date-fns`. `PLANNING.txt` lists EventCalendar only.
- Coverage: `timeline-scale`, `timeline-pending` and `date-gesture` unit tests
  and the `timeline` browser suite, beside the existing planning, command
  outcome and recovery suites, which now reach date changes through gestures.
