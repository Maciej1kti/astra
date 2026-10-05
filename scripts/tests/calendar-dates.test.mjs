import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarCells,
  calendarMonth,
  calendarShift,
  calendarRange,
  calendarToday,
  dayDistance,
  isCivilDate,
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
test("a civil date is any real day the server accepts; pickers start at year one", () => {
  for (const value of ["2028-02-29", "0001-01-01", "9999-12-31"]) {
    assert.equal(isCivilDate(value), true, value);
    assert.equal(validCalendarDate(value), true, value);
  }
  // Year zero is a valid source date that calendar navigation cannot reach.
  assert.equal(isCivilDate("0000-01-01"), true);
  assert.equal(validCalendarDate("0000-01-01"), false);
  for (const value of [
    "",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "2026-9-08",
    "02026-09-08",
    "2026-09-08T10:00",
    " 2026-09-08",
    "not a date",
  ]) {
    assert.equal(isCivilDate(value), false, value);
    assert.equal(validCalendarDate(value), false, value);
  }
});
test("day distance counts civil days across leap days and clock changes", () => {
  assert.equal(dayDistance("2026-09-08", "2026-09-08"), 0);
  assert.equal(dayDistance("2026-09-08", "2026-09-09"), 1);
  assert.equal(dayDistance("2026-09-09", "2026-09-08"), -1);
  assert.equal(dayDistance("2024-02-28", "2024-03-01"), 2);
  assert.equal(dayDistance("2026-03-28", "2026-03-30"), 2);
  assert.equal(dayDistance("2026-10-24", "2026-10-26"), 2);
  assert.equal(dayDistance("2025-12-31", "2027-01-01"), 366);
});
test("today is the workspace's civil day, whatever the browser's zone or locale", () => {
  const instant = Date.parse("2026-09-26T22:30:00Z");
  assert.equal(calendarToday("Europe/Warsaw", instant), "2026-09-27");
  assert.equal(calendarToday("America/Los_Angeles", instant), "2026-09-26");
  assert.equal(calendarToday("UTC", instant), "2026-09-26");
  assert.equal(calendarToday("Pacific/Kiritimati", instant), "2026-09-27");
  assert.equal(
    calendarToday("UTC", Date.parse("2026-01-05T00:00:00Z")),
    "2026-01-05",
  );
  assert.match(calendarToday("Europe/Warsaw"), /^\d{4}-\d{2}-\d{2}$/);
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
