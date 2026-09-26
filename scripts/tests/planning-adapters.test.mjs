import test from "node:test";
import assert from "node:assert/strict";
import { calendarEvents } from "../../apps/web/src/features/planning/calendar-events.ts";
import { ganttTasks } from "../../apps/web/src/features/planning/gantt-tasks.ts";
import { dateOnly } from "../../apps/web/src/features/planning/planning.ts";

test("calendar conversion keeps inclusive source dates and only allows ready schedule edits", () => {
  const schedule = {
    project_id: "p",
    item_id: "schedule",
    title: "Work",
    kind: "card_schedule",
    start: "2026-09-01",
    end: "2026-09-01",
  };
  const due = { ...schedule, item_id: "due", kind: "milestone_due" };
  const events = calendarEvents([schedule, due], "work", true);
  assert.equal(events[0].end, "2026-09-02");
  assert.equal(schedule.end, "2026-09-01");
  assert.equal(events[0].editable, true);
  assert.equal(events[1].editable, false);
  assert.equal(calendarEvents([schedule], "", false)[0].editable, false);
  assert.deepEqual(calendarEvents([schedule], "missing", true), []);
});

test("Gantt tasks use saved schedules and milestone due dates", () => {
  const card = {
    id: "c",
    type: "card",
    title: "Card",
    schedule: { start: "2026-09-01", end: "2026-09-02" },
  };
  const milestone = {
    id: "m",
    type: "milestone",
    title: "Ship",
    due: { date: "2026-09-05" },
  };
  const tasks = ganttTasks([card, milestone]);
  assert.equal(dateOnly(tasks[0].start), "2026-09-01");
  assert.equal(dateOnly(tasks[0].end), "2026-09-03");
  assert.equal(dateOnly(tasks[1].start), "2026-09-05");
  assert.equal(tasks[1].duration, 0);
  assert.equal(card.schedule.start, "2026-09-01");
  assert.equal(dateOnly(ganttTasks([card])[0].start), "2026-09-01");
  assert.deepEqual(
    ganttTasks([{ id: "u", type: "card", title: "Undated" }]),
    [],
  );
});

test("timed events retain clock fields and occupy only intersected calendar days", async () => {
  const { eventEnd, eventDates, eventFromDates } =
    await import("../../apps/web/src/lib/resources/timed-event.ts");
  const event = { start: "2026-09-30T23:30", duration_minutes: 90 };
  assert.equal(eventEnd(event), "2026-10-01T01:00");
  assert.deepEqual(eventDates({ ...event, duration_minutes: 30 }), {
    start: "2026-09-30",
    end: "2026-09-30",
  });
  const [calendar] = calendarEvents(
    [
      {
        project_id: "p",
        item_id: "e",
        title: "Event",
        kind: "card_event",
        start: "2026-09-30",
        end: "2026-10-01",
        event,
      },
    ],
    "",
    true,
  );
  assert.equal(calendar.allDay, false);
  assert.equal(calendar.start, event.start);
  assert.equal(calendar.end, "2026-10-01T01:00");
  assert.equal(calendar.durationEditable, true);
  const [task] = ganttTasks([{ id: "e", type: "card", title: "Event", event }]);
  assert.equal(dateOnly(task.start), "2026-09-30");
  assert.equal(dateOnly(task.end), "2026-10-02");
  assert.equal(task.astra.schedule, undefined);
  assert.deepEqual(
    eventFromDates(new Date(2026, 8, 30, 23, 30), new Date(2026, 9, 1, 1, 0)),
    event,
  );
  assert.throws(() => eventEnd({ ...event, duration_minutes: 0 }));
  assert.throws(() => eventEnd({ ...event, start: "2026-02-30T12:00" }));
});
