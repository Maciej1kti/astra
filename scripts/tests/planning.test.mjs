import { test } from "node:test";
import assert from "node:assert/strict";
import {
  widgetDate,
  dateOnly,
  exclusiveSchedule,
  inclusiveSchedule,
} from "../../apps/web/src/features/planning/planning.ts";

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
        const widget = exclusiveSchedule(schedule);
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
