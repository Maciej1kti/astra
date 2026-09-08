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
  const due = { ...schedule, item_id: "due", kind: "card_due" };
  const events = calendarEvents([schedule, due], "work", true);
  assert.equal(events[0].end, "2026-09-02");
  assert.equal(schedule.end, "2026-09-01");
  assert.equal(events[0].editable, true);
  assert.equal(events[1].editable, false);
  assert.equal(calendarEvents([schedule], "", false)[0].editable, false);
  assert.deepEqual(calendarEvents([schedule], "missing", true), []);
});

test("forecast tasks never change source schedules or milestone deadlines", () => {
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
    due: { date: "2026-09-05", kind: "hard" },
  };
  const forecasts = new Map([
    [
      "c",
      {
        schedule: { start: "2026-09-03", end: "2026-09-04" },
        drives_finish: true,
      },
    ],
  ]);
  const tasks = ganttTasks([card, milestone], forecasts, true);
  assert.equal(dateOnly(tasks[0].start), "2026-09-03");
  assert.equal(dateOnly(tasks[0].end), "2026-09-05");
  assert.equal(tasks[0].astraDriving, true);
  assert.equal(dateOnly(tasks[1].start), "2026-09-05");
  assert.equal(tasks[1].duration, 0);
  assert.equal(card.schedule.start, "2026-09-01");
  assert.equal(
    dateOnly(ganttTasks([card], forecasts, false)[0].start),
    "2026-09-01",
  );
  assert.deepEqual(ganttTasks([card], new Map(), true), []);
});
