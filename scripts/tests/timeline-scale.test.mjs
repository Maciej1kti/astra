import test from "node:test";
import assert from "node:assert/strict";
import {
  axisDate,
  axisSpan,
  calendarSegments,
  dayOffset,
  monthLength,
  shiftMonth,
  timelineAxis,
  weekSegments,
  weekday,
} from "../../apps/web/src/features/planning/timeline-scale.ts";
import { timelineItems } from "../../apps/web/src/features/planning/timeline-items.ts";

test("months shift across years and know their length", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-09", 18), "2028-03");
  assert.equal(monthLength("2026-09"), 30);
  assert.equal(monthLength("2028-02"), 29);
});

test("weekdays count from Monday whatever the browser's zone is", () => {
  assert.equal(weekday("2026-09-07"), 0);
  assert.equal(weekday("2026-09-12"), 5);
  assert.equal(weekday("2026-09-13"), 6);
});

test("the axis covers whole months around the month and its rows", () => {
  assert.deepEqual(timelineAxis("2026-09", []), {
    start: "2026-08-01",
    days: 92,
  });
  const axis = timelineAxis("2026-09", ["2026-07-20", "2026-11-03"]);
  assert.equal(axis.start, "2026-06-01");
  assert.equal(axisDate(axis, axis.days - 1), "2026-12-31");
  assert.equal(dayOffset(axis, "2026-09-01"), 92);
});

test("rows years away do not stretch the axis", () => {
  const axis = timelineAxis("2026-09", ["0001-01-01", "9999-12-31"]);
  assert.equal(axis.start, "2025-02-01");
  assert.equal(axisDate(axis, axis.days - 1), "2028-04-30");
  assert.equal(axisSpan(axis, "0001-01-01", "0001-01-05"), null);
  assert.equal(axisSpan(axis, "9999-12-01", "9999-12-31"), null);
});

test("any day of the requested month can stand at the left edge", () => {
  const axis = timelineAxis("2026-09", [], 300);
  assert.equal(axis.start, "2026-08-01");
  assert.equal(axis.days, 31 + 30 + 300);
});

test("month and year segments tile the axis exactly", () => {
  const axis = timelineAxis("2026-12", ["2027-01-15"]);
  const months = calendarSegments(axis, "month");
  assert.deepEqual(
    months.map((segment) => [segment.start, segment.offset, segment.span]),
    [
      ["2026-11-01", 0, 30],
      ["2026-12-01", 30, 31],
      ["2027-01-01", 61, 31],
      ["2027-02-01", 92, 28],
    ],
  );
  assert.deepEqual(
    calendarSegments(axis, "year").map((segment) => [
      segment.start,
      segment.offset,
      segment.span,
    ]),
    [
      ["2026-11-01", 0, 61],
      ["2027-01-01", 61, 59],
    ],
  );
});

test("weeks start on the workspace's first weekday with partial ends", () => {
  // 1 August 2026 is a Saturday.
  const axis = { start: "2026-08-01", days: 20 };
  assert.deepEqual(
    weekSegments(axis, 0).map((segment) => [segment.start, segment.span]),
    [
      ["2026-08-01", 2],
      ["2026-08-03", 7],
      ["2026-08-10", 7],
      ["2026-08-17", 4],
    ],
  );
  assert.deepEqual(
    weekSegments(axis, 6).map((segment) => [segment.start, segment.span]),
    [
      ["2026-08-01", 1],
      ["2026-08-02", 7],
      ["2026-08-09", 7],
      ["2026-08-16", 5],
    ],
  );
});

test("a row is clipped to the axis and keeps inclusive days", () => {
  const axis = { start: "2026-08-01", days: 31 };
  assert.deepEqual(axisSpan(axis, "2026-08-03", "2026-08-05"), {
    offset: 2,
    span: 3,
  });
  assert.deepEqual(axisSpan(axis, "2026-07-30", "2026-08-02"), {
    offset: 0,
    span: 2,
  });
  assert.deepEqual(axisSpan(axis, "2026-08-30", "2026-09-04"), {
    offset: 29,
    span: 2,
  });
  assert.equal(axisSpan(axis, "2026-09-01", "2026-09-02"), null);
  assert.equal(axisDate(axis, -4), "2026-08-01");
  assert.equal(axisDate(axis, 99.5), "2026-08-31");
});

test("only rows with recorded dates take a place on the axis", () => {
  const row = (extra) => ({
    type: "card",
    id: "id",
    project_id: "p",
    title: "t",
    version: "v",
    ...extra,
  });
  const items = timelineItems([
    row({ id: "plan", schedule: { start: "2026-09-07", end: "2026-09-09" } }),
    row({ id: "undated" }),
    row({
      id: "event",
      event: { start: "2026-09-10T23:30", duration_minutes: 60 },
      schedule: { start: "2026-09-01", end: "2026-09-02" },
    }),
    row({ id: "milestone", type: "milestone", due: { date: "2026-09-11" } }),
    row({ id: "open-milestone", type: "milestone" }),
    row({
      id: "goal",
      type: "project",
      span: { start: "2026-09-01", end: "2026-10-20" },
      // A goal is placed by its cards' span, never by a schedule of its own.
      schedule: { start: "2026-01-01", end: "2026-01-02" },
    }),
    row({ id: "undated-goal", type: "project" }),
  ]);
  assert.deepEqual(
    items.map((item) => [item.row.id, item.kind, item.start, item.end]),
    [
      ["plan", "plan", "2026-09-07", "2026-09-09"],
      ["event", "event", "2026-09-10", "2026-09-11"],
      ["milestone", "milestone", "2026-09-11", "2026-09-11"],
      ["goal", "goal", "2026-09-01", "2026-10-20"],
    ],
  );
});
