import test from "node:test";
import assert from "node:assert/strict";
import { counterTrend } from "../../apps/web/src/features/cards/counter-trend.ts";

test("counter previews use fourteen civil days and distinguish absent entries from zero", () => {
  const values = {
    "2026-09-16": 999,
    "2026-09-17": 0,
    "2026-09-29": 8,
    "2026-09-30": 3,
    "2026-10-01": 99,
  };
  const trend = counterTrend(values, "2026-09-30");
  assert.equal(trend.length, 14);
  assert.deepEqual(trend[0], { date: "2026-09-17", value: 0 });
  assert.deepEqual(trend[1], { date: "2026-09-18", value: null });
  assert.deepEqual(trend.at(-2), { date: "2026-09-29", value: 8 });
  assert.deepEqual(trend.at(-1), { date: "2026-09-30", value: 3 });
  assert.equal(Object.keys(values).length, 5);
});

test("counter preview windows cross leap days, month boundaries and workspace DST dates", () => {
  assert.equal(counterTrend({}, "2024-03-01").at(-2).date, "2024-02-29");
  assert.equal(counterTrend({}, "2026-01-01")[0].date, "2025-12-19");
  const autumn = counterTrend({}, "2026-10-27");
  assert.equal(new Set(autumn.map((day) => day.date)).size, 14);
  assert.equal(autumn[0].date, "2026-10-14");
  assert.ok(autumn.every((day) => day.value === null));
});
