import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCalendarDate,
  navigateCalendar,
  calendarWidgetView,
} from "../../apps/web/src/lib/planning-navigation.ts";

test("calendar navigation preserves its period across month, year and leap boundaries", () => {
  assert.equal(navigateCalendar("2026-01-31", "month", 1), "2026-02-01");
  assert.equal(navigateCalendar("2026-12-31", "month", 1), "2027-01-01");
  assert.equal(navigateCalendar("2026-01-15", "month", -1), "2025-12-01");
  assert.equal(navigateCalendar("2028-02-28", "day", 1), "2028-02-29");
  assert.equal(navigateCalendar("2026-12-28", "week", 1), "2027-01-04");
  assert.equal(navigateCalendar("2026-10-13", "agenda", -1), "2026-10-06");
});

test("invalid date input cannot enter calendar navigation or scheduled creation", () => {
  for (const value of [
    "",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-9-08",
    "not a date",
  ])
    assert.equal(isCalendarDate(value), false, value);
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.throws(() => navigateCalendar("2026-02-30", "day", 1));
});

test("a compact month shows the whole month agenda and retains explicit grid access", () => {
  assert.equal(calendarWidgetView("month", false, false), "dayGridMonth");
  assert.equal(calendarWidgetView("month", true, false), "listMonth");
  assert.equal(calendarWidgetView("month", true, true), "dayGridMonth");
  assert.equal(calendarWidgetView("agenda", true, false), "listWeek");
  assert.equal(calendarWidgetView("week", true, false), "dayGridWeek");
  assert.equal(calendarWidgetView("day", true, false), "dayGridDay");
});

test("calendar navigation uses whole-day inputs without a browser-timezone shift", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of [
      "Pacific/Honolulu",
      "Europe/Warsaw",
      "Pacific/Auckland",
    ]) {
      process.env.TZ = timezone;
      assert.equal(navigateCalendar("2026-09-08", "day", 0), "2026-09-08");
      assert.equal(navigateCalendar("2026-09-08", "month", 1), "2026-10-01");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
