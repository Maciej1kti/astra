# ADR-044: Timed events on cards

Date: 2026-09-26. Status: accepted by owner direction.

Cards optionally carry `event: { start, duration_minutes }`. The presence of a
start time classifies a card as an event. Date-only work continues to use the
inclusive `schedule: { start, end }`. The two fields are mutually exclusive.
Events retain card status, priority, tags, checklist, reports and Focus pinning;
no second entity or duplicated project is created. Existing cards are unchanged.

The start is a civil `YYYY-MM-DDTHH:mm` clock value in the workspace timezone.
Duration is an integer from 1 to 10080 wall-clock minutes (up to seven days); the
exclusive end is derived. Browser timezone changes never rewrite these fields.
This is a local planning model, not an absolute UTC meeting or recurrence model:
a workspace timezone change reinterprets the same clock values, and DST clock
changes do not add or subtract duration. Ambiguous/nonexistent local hours retain
the entered civil values. Absolute instants and external calendar sync would need
a separate explicit contract. Dates, time syntax, duration and end-year overflow
are validated by shared server domain rules for browser, CLI and source reads.

Creation supplies either field; conversion uses one atomic conditional patch
setting the new field and clearing the old. The editor adds Start time and
Duration (minutes), and hides the plan's End date while time is set. Removing the
time converts to a date plan. Existing event edits preserve start and duration.
The usual observed version, retry identity and durable source-write sequence apply.

Calendar projections return `kind: card_event`, the event, and inclusive occupied
day bounds for existing range pagination. An event ending exactly at midnight
occupies only the preceding day. Day/week views show hourly slots. Calendar
movement and resizing preserve timing and use the same conditional proposal
workflow as planned dates; dragging across timed/all-day lanes cannot implicitly
convert a card. Keyboard day movement is also supported. Gantt shows events on
the days they occupy; its day-only handles remain for date plans. An event bar
opens the editor for precise timing.

Focus attention compares the derived civil end with the current workspace clock.
Ended active events are overdue; events starting within seven days are due soon.
Attention cursors include the current minute to reject pages across expiry.
Project folders continue to filter event cards through their project.

Milestones remain separate dated checkpoints. The owner's suggestion to replace
them is an open scope decision, not permission to delete or convert existing data.
