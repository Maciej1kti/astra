import test from "node:test";
import assert from "node:assert/strict";
import {
  chartColorSlots,
  chartDomain,
  chartFrame,
  chartIndex,
  chartLine,
  chartMoney,
  chartPerson,
  chartSettlement,
  chartPanels,
  chartPeriods,
  chartPoints,
  chartRangeDays,
  chartRate,
  chartSeriesKey,
  chartStats,
  chartTicks,
  chartX,
  readChartPreferences,
  writeChartPreferences,
} from "../../apps/web/src/features/charts/chart-model.ts";

function series(name, unit, values, id = name) {
  return {
    project_id: "project",
    project_name: "Projekt",
    card_id: "card",
    card_title: "Karta",
    id,
    name,
    unit,
    archived: false,
    values,
  };
}

test("chart ranges and Monday/month buckets clip to inclusive civil dates", () => {
  assert.equal(chartRangeDays("2024-02-28", "2024-03-01"), 3);
  assert.equal(chartRangeDays("2026-03-28", "2026-03-30"), 3);
  assert.equal(chartRangeDays("2026-10-24", "2026-10-26"), 3);
  assert.equal(chartRangeDays("2026-02-30", "2026-03-04"), 0);
  assert.equal(chartRangeDays("2026-03-04", "2026-03-03"), 0);
  assert.deepEqual(chartPeriods("2026-09-30", "2026-10-12", "week"), [
    { from: "2026-09-30", to: "2026-10-04", days: 5 },
    { from: "2026-10-05", to: "2026-10-11", days: 7 },
    { from: "2026-10-12", to: "2026-10-12", days: 1 },
  ]);
  assert.deepEqual(chartPeriods("2024-02-28", "2024-03-02", "month"), [
    { from: "2024-02-28", to: "2024-02-29", days: 2 },
    { from: "2024-03-01", to: "2024-03-02", days: 2 },
  ]);
  assert.deepEqual(chartPeriods("2025-01-01", "2026-12-31", "day"), []);
  assert.equal(chartPeriods("2026-10-04", "2026-10-04", "day").length, 1);
});

test("recorded zeroes count in statistics while missing and out-of-range days do not", () => {
  const values = {
    "2026-10-01": 10,
    "2026-10-02": 0,
    "2026-10-04": 30,
    "2026-10-05": 999,
  };
  assert.deepEqual(chartStats(values, "2026-10-01", "2026-10-04"), {
    total: 40,
    recorded: 3,
    positive: 2,
    average: 40 / 3,
    peak: 30,
    peakDate: "2026-10-04",
    lastDate: "2026-10-04",
    lastValue: 30,
  });
  assert.deepEqual(chartStats({}, "2026-10-01", "2026-10-04"), {
    total: 0,
    recorded: 0,
    positive: 0,
    average: null,
    peak: null,
    peakDate: null,
    lastDate: null,
    lastValue: null,
  });
  const periods = chartPeriods("2026-10-01", "2026-10-04", "day");
  assert.deepEqual(
    chartPoints(values, periods).map((row) => row.value),
    [10, 0, null, 30],
  );
  assert.deepEqual(
    chartPoints(values, periods, true).map((row) => row.value),
    [10, 10, null, 40],
  );
  const weekly = chartPoints(
    values,
    chartPeriods("2026-10-01", "2026-10-04", "week"),
  );
  assert.equal(weekly[0].value, 40);
  assert.equal(weekly[0].recorded, 3);
  assert.equal(weekly[0].days, 4);
});

test("chart lines join every recording across missing buckets and retain a recorded zero", () => {
  const frame = chartFrame(920, 300);
  assert.deepEqual(frame, { left: 56, right: 904, top: 12, bottom: 270 });
  const points = chartPoints(
    { "2026-10-01": 10, "2026-10-02": 0, "2026-10-04": 30 },
    chartPeriods("2026-10-01", "2026-10-04", "day"),
  );
  const line = chartLine(points, 0, 30, frame);
  assert.equal((line.match(/M/g) ?? []).length, 1);
  assert.equal((line.match(/L/g) ?? []).length, 2);
  assert.match(line, /L374\.00,270\.00/);
  assert.ok(
    line.endsWith(`L${chartX(3, 4, frame).toFixed(2)},12.00`),
    "The line reaches the recording after the missing day",
  );
  assert.equal(
    chartLine(
      chartPoints({}, chartPeriods("2026-10-01", "2026-10-04", "day")),
      0,
      1,
      frame,
    ),
    "",
  );
});

test("a running total carries its level through missing days and joins its recordings", () => {
  const frame = chartFrame(920, 300);
  const periods = chartPeriods("2026-10-01", "2026-10-05", "day");
  const points = chartPoints(
    { "2026-10-02": 10, "2026-10-03": 0, "2026-10-05": 30 },
    periods,
    true,
  );
  assert.deepEqual(
    points.map((point) => [point.value, point.carried]),
    [
      [null, null],
      [10, 10],
      [10, 10],
      [null, 10],
      [40, 40],
    ],
  );
  assert.deepEqual(
    chartPoints({ "2026-10-02": 10 }, periods).map((point) => point.carried),
    [null, null, null, null, null],
    "Period totals carry nothing between recordings",
  );
  const line = chartLine(points, 0, 40, frame);
  assert.equal((line.match(/M/g) ?? []).length, 1);
  assert.equal((line.match(/L/g) ?? []).length, 2);
  assert.ok(
    line.startsWith(`M${chartX(1, 5, frame).toFixed(2)},`),
    "Nothing is drawn before the first recording",
  );
  assert.ok(line.endsWith(",12.00"), "The last recording reaches the peak");
});

test("axis steps are round and periods map to equal bands", () => {
  assert.deepEqual(chartTicks(0, 20), [0, 5, 10, 15, 20]);
  assert.deepEqual(chartTicks(0, 500), [0, 200, 400, 600]);
  assert.deepEqual(chartTicks(0, 1), [0, 0.5, 1]);
  assert.deepEqual(chartTicks(0, 0.3), [0, 0.1, 0.2, 0.3]);
  assert.deepEqual(chartTicks(-10, 30), [-10, 0, 10, 20, 30]);
  assert.deepEqual(chartTicks(5, 5), [5, 5.5]);
  const frame = chartFrame(320, 220);
  assert.deepEqual(frame, { left: 44, right: 308, top: 12, bottom: 190 });
  assert.equal(chartX(0, 4, frame), 77);
  assert.equal(chartX(0, 1, frame), 176);
  assert.equal(chartIndex(44, 4, frame), 0);
  assert.equal(chartIndex(109.9, 4, frame), 0);
  assert.equal(chartIndex(110.1, 4, frame), 1);
  assert.equal(chartIndex(-50, 4, frame), 0);
  assert.equal(chartIndex(9999, 4, frame), 3);
  assert.equal(chartIndex(100, 0, frame), 0);
});

test("a counter keeps its colour slot while the selection changes", () => {
  const first = chartColorSlots({}, ["a", "b", "c"]);
  assert.deepEqual(first, { a: 0, b: 1, c: 2 });
  const without = chartColorSlots(first, ["b", "c"]);
  assert.deepEqual(without, { b: 1, c: 2 });
  assert.deepEqual(chartColorSlots(without, ["d", "b", "c"]), {
    b: 1,
    c: 2,
    d: 0,
  });
  assert.deepEqual(
    Object.values(
      chartColorSlots({ a: 3, b: 3 }, ["a", "b", "c", "d", "e", "f", "g", "h"]),
    ).sort(),
    [0, 1, 2, 3, 4, 5, 6, 7],
    "Eight selections always receive eight distinct slots",
  );
  const rows = [
    series("One", "reps", { "2026-10-01": 1 }, "one"),
    series("Two", "reps", { "2026-10-01": 2 }, "two"),
  ];
  const periods = chartPeriods("2026-10-01", "2026-10-01", "day");
  const panels = chartPanels(rows, periods, false, {
    [chartSeriesKey(rows[1])]: 5,
  });
  assert.deepEqual(
    panels[0].series.map((row) => row.color),
    [0, 5],
  );
});

test("counters share a plot only when their units match", () => {
  const rows = [
    series("Push-ups", "reps", { "2026-10-01": 10, "2026-10-02": 20 }),
    series("Squats", " reps ", { "2026-10-01": 20 }, "squats"),
    series("Work", "hours", { "2026-10-01": 2, "2026-10-02": 3 }),
    series("Unnamed", "", { "2026-10-01": 0 }),
  ];
  const periods = chartPeriods("2026-10-01", "2026-10-02", "day");
  const panels = chartPanels(rows, periods, false);
  assert.deepEqual(
    panels.map((panel) => [panel.unit, panel.series.length]),
    [
      ["reps", 2],
      ["hours", 1],
      ["units", 1],
    ],
  );
  assert.deepEqual(chartDomain(panels[0]), { min: 0, max: 20 });
  assert.deepEqual(chartDomain(panels[1]), { min: 0, max: 3 });
  assert.deepEqual(
    panels[0].series[1].points.map((point) => point.value),
    [20, null],
  );
  assert.deepEqual(
    panels[2].series[0].points.map((point) => point.value),
    [0, null],
    "A recorded zero stays a plotted value",
  );
  assert.deepEqual(chartDomain(panels[2]), { min: 0, max: 1 });
  assert.deepEqual(
    chartPanels(rows, periods, true)[0].series[0].points.map(
      (point) => point.value,
    ),
    [10, 30],
  );
});

test("a rate accepts zero and decimal commas, and rejects everything else", () => {
  for (const raw of [
    undefined,
    "",
    " ",
    "NaN",
    "Infinity",
    "-1",
    "1e5",
    "1000000001",
    "0x10",
  ])
    assert.equal(chartRate(raw), null);
  for (const [raw, value] of [
    ["0", 0],
    [" 2.5 ", 2.5],
    [" 2,5 ", 2.5],
    [",5", 0.5],
    [".5", 0.5],
    ["1000000000", 1_000_000_000],
  ])
    assert.equal(chartRate(raw), value);
});

test("rate preferences are profile-scoped, bounded and survive unavailable browser storage", () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  assert.deepEqual(readChartPreferences("a", storage), {
    rates: {},
    outputUnit: "PLN",
  });
  assert.equal(
    writeChartPreferences(
      "a",
      {
        rates: { "project/card/id": "2.5", bad: "Infinity" },
        outputUnit: "EUR",
      },
      storage,
    ),
    true,
  );
  assert.deepEqual(readChartPreferences("a", storage), {
    rates: { "project/card/id": "2.5" },
    outputUnit: "EUR",
  });
  assert.deepEqual(readChartPreferences("b", storage), {
    rates: {},
    outputUnit: "PLN",
  });
  const unavailable = {
    getItem: () => {
      throw new Error("disabled");
    },
    setItem: () => {
      throw new Error("disabled");
    },
  };
  assert.deepEqual(readChartPreferences("a", unavailable), {
    rates: {},
    outputUnit: "PLN",
  });
  assert.equal(
    writeChartPreferences("a", { rates: {}, outputUnit: "PLN" }, unavailable),
    false,
  );
});

test("a settlement names people by the last word and has the lower value pay the difference", () => {
  assert.equal(chartPerson("Pompki Tomek"), "Tomek");
  assert.equal(chartPerson("  Brzuszki   poranne Maciek "), "Maciek");
  assert.equal(chartPerson("Push-ups"), null);
  const row = (name, total, rate) => ({
    source: { name },
    stats: { total },
    rate,
    color: 0,
  });
  const settlement = chartSettlement([
    row("Pompki Tomek", 8900, 0.01),
    row("Pompki Maciek", 33, 0.01),
    row("Brzuszki Tomek", 9050, 0.02),
    row("Brzuszki Maciek", 15, null),
    row("Push-ups", 500, 5),
  ]);
  assert.deepEqual(settlement.parties, [
    { name: "Tomek", value: 270 },
    { name: "Maciek", value: 0.33 },
  ]);
  assert.deepEqual(settlement.debts, [
    { from: "Maciek", to: "Tomek", amount: 269.67 },
  ]);
  assert.equal(settlement.people, 2);
  assert.equal(settlement.unrated, 1);
  assert.equal(chartMoney(269.67).replace(/\s/g, " "), "269,67");
  assert.equal(chartMoney(270), "270,00");

  const three = chartSettlement([
    row("A Ola", 10, 1),
    row("A Ala", 30, 1),
    row("A Ela", 10, 1),
  ]);
  assert.deepEqual(three.debts, [
    { from: "Ela", to: "Ala", amount: 20 },
    { from: "Ola", to: "Ala", amount: 20 },
  ]);
  const unratedOnly = chartSettlement([
    row("Pompki Tomek", 5, null),
    row("Pompki Maciek", 3, null),
  ]);
  assert.deepEqual(
    [unratedOnly.people, unratedOnly.parties.length, unratedOnly.debts.length],
    [2, 0, 0],
  );
});
