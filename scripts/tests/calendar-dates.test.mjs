import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarCells,
  calendarMonth,
  calendarShift,
  calendarRange,
  validCalendarDate,
} from "../../apps/web/src/lib/ui/calendar-dates.ts";
test("calendar grids respect week start, leap days and civil year boundaries", () => {
  const monday = calendarCells("2026-09-01", "monday");
  const sunday = calendarCells("2026-09-01", "sunday");
  assert.equal(monday.length, 42);
  assert.equal(monday[0], "2026-08-31");
  assert.equal(sunday[0], "2026-08-30");
  assert.equal(calendarMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(calendarMonth("2026-01-31", 1), "2026-02-28");
  assert.equal(calendarShift("2026-12-31", 1), "2027-01-01");
  assert.equal(calendarShift("0001-01-01", -1), null);
  assert.equal(calendarMonth("9999-12-31", 1), null);
  assert.equal(validCalendarDate("2026-02-30"), false);
  assert.equal(validCalendarDate("0000-01-01"), false);
});
test("range selection remains valid when selecting backwards, replacing a start, or choosing an event day", () => {
  assert.deepEqual(calendarRange("", "", "2026-09-30", "start", false), {
    start: "2026-09-30",
    end: "2026-09-30",
  });
  assert.deepEqual(
    calendarRange("2026-09-30", "2026-09-30", "2026-09-20", "end", false),
    { start: "2026-09-20", end: "2026-09-30" },
  );
  assert.deepEqual(
    calendarRange("2026-09-20", "2026-09-30", "2026-10-01", "start", false),
    { start: "2026-10-01", end: "2026-10-01" },
  );
  assert.deepEqual(
    calendarRange("2026-09-20", "2026-09-30", "2026-10-01", "end", true),
    { start: "2026-10-01", end: "2026-10-01" },
  );
});
