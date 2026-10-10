import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarLabel,
  calendarTarget,
  goalItems,
  inclusiveSchedule,
} from "../../apps/web/src/features/planning/planning.ts";
import { calendarEventProjection } from "../../apps/web/src/features/planning/calendar-events.ts";
import { keyboardDateProposal } from "../../apps/web/src/features/planning/calendar-keyboard.ts";
import { shiftDate } from "../../apps/web/src/features/planning/dates.ts";
import {
  widgetDate,
  dateOnly,
} from "../../apps/web/src/features/planning/widget-dates.ts";

test("widget boundaries round-trip inclusive dates in different client timezones", () => {
  const previous = process.env.TZ;
  try {
    for (const tz of [
      "Europe/Warsaw",
      "America/Los_Angeles",
      "Pacific/Auckland",
      "UTC",
    ]) {
      process.env.TZ = tz;
      for (const schedule of [
        { start: "2026-09-07", end: "2026-09-07" },
        { start: "2026-03-28", end: "2026-03-30" },
        { start: "2026-10-24", end: "2026-10-26" },
        { start: "2028-02-28", end: "2028-02-29" },
        { start: "2026-12-31", end: "2027-01-01" },
      ]) {
        // The calendar widget's own form: local dates with an exclusive end.
        const widget = {
          start: widgetDate(schedule.start),
          end: widgetDate(shiftDate(schedule.end, 1)),
        };
        assert.deepEqual(
          inclusiveSchedule(widget.start, widget.end),
          schedule,
          tz,
        );
        assert.equal(dateOnly(widgetDate(schedule.start)), schedule.start, tz);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("empty or reversed widget ranges never become a persisted schedule", () => {
  assert.throws(() =>
    inclusiveSchedule(widgetDate("2026-09-08"), widgetDate("2026-09-08")),
  );
  assert.throws(() => dateOnly(new Date(NaN)));
});

test("goals with dated cards become read-only Calendar items that open the goal", () => {
  const goal = (extra) => ({
    type: "project",
    project_id: extra.id,
    title: extra.id,
    version: "v1",
    ...extra,
  });
  const items = goalItems([
    goal({ id: "dated", span: { start: "2026-09-28", end: "2026-11-03" } }),
    goal({ id: "undated" }),
    // Only a goal's derived span places it; a card is not a goal.
    {
      ...goal({ id: "card", span: { start: "2026-09-01", end: "2026-09-02" } }),
      type: "card",
    },
  ]);
  assert.deepEqual(items, [
    {
      item_id: "goal:dated",
      kind: "project_span",
      project_id: "dated",
      resource_id: "dated",
      version: "v1",
      title: "dated",
      start: "2026-09-28",
      end: "2026-11-03",
    },
  ]);
  assert.deepEqual(calendarTarget(items[0]), {
    id: "dated",
    project_id: "dated",
    type: "project",
  });
  assert.equal(calendarLabel(items[0]), "Cel");
  // The widget's end is exclusive; nothing about a goal can be dragged.
  const [event] = calendarEventProjection()(items, "", true);
  assert.equal(event.allDay, true);
  assert.equal(event.end, "2026-11-04");
  assert.equal(event.editable, false);
  assert.equal(event.startEditable, false);
  assert.equal(event.durationEditable, false);
  assert.equal(
    keyboardDateProposal(
      { key: "ArrowRight", altKey: true, shiftKey: false },
      items[0],
    ),
    null,
  );
});
