import test from "node:test";
import assert from "node:assert/strict";
import {
  chartDomain,
  chartLine,
  chartPanels,
  chartPeriods,
  chartPoints,
  chartRangeDays,
  chartRate,
  chartSeriesKey,
  chartStats,
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

test("chart lines break on missing buckets and retain a recorded zero", () => {
  const points = chartPoints(
    { "2026-10-01": 10, "2026-10-02": 0, "2026-10-04": 30 },
    chartPeriods("2026-10-01", "2026-10-04", "day"),
  );
  const line = chartLine(points, 0, 30);
  assert.equal((line.match(/M/g) ?? []).length, 2);
  assert.equal((line.match(/L/g) ?? []).length, 1);
  assert.match(line, /L338\.00,250\.00/);
  assert.equal(
    chartLine(
      chartPoints({}, chartPeriods("2026-10-01", "2026-10-04", "day")),
      0,
      1,
    ).trim(),
    "",
  );
});

test("raw units retain independent scales; relative and explicit-rate modes safely overlay", () => {
  const rows = [
    series("Push-ups", "reps", { "2026-10-01": 10, "2026-10-02": 20 }),
    series("Squats", "reps", { "2026-10-01": 20 }),
    series("Work", "hours", { "2026-10-01": 2, "2026-10-02": 3 }),
  ];
  const periods = chartPeriods("2026-10-01", "2026-10-02", "day");
  const raw = chartPanels(rows, periods, false, "values", {}, "PLN");
  assert.deepEqual(
    raw.map((panel) => [panel.unit, panel.series.length]),
    [
      ["reps", 2],
      ["hours", 1],
    ],
  );
  assert.deepEqual(chartDomain(raw[0]), { min: 0, max: 20 });
  const normalized = chartPanels(rows, periods, false, "relative", {}, "PLN");
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].unit, "% własnego maksimum");
  assert.deepEqual(
    normalized[0].series[0].points.map((point) => point.value),
    [50, 100],
  );
  assert.deepEqual(
    normalized[0].series[1].points.map((point) => point.value),
    [100, null],
  );
  const rates = {
    [chartSeriesKey(rows[0])]: "2.5",
    [chartSeriesKey(rows[2])]: "100",
  };
  const converted = chartPanels(
    rows,
    periods,
    false,
    "converted",
    rates,
    "PLN",
  );
  assert.equal(converted.length, 1);
  assert.equal(converted[0].series.length, 2);
  assert.equal(converted[0].unit, "PLN");
  assert.deepEqual(
    converted[0].series[0].points.map((point) => point.value),
    [25, 50],
  );
  assert.deepEqual(
    converted[0].series[1].points.map((point) => point.value),
    [200, 300],
  );
  assert.deepEqual(
    chartPanels(rows, periods, false, "converted", {}, "PLN"),
    [],
  );
});

test("zero rates and all-zero normalized series remain plotted, while invalid rates are absent", () => {
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
  const rows = [
    series("Zero", "reps", { "2026-10-01": 0 }),
    series("Missing", "reps", {}),
  ];
  const periods = chartPeriods("2026-10-01", "2026-10-02", "day");
  const normalized = chartPanels(rows, periods, true, "relative", {}, "points");
  assert.deepEqual(
    normalized[0].series[0].points.map((point) => point.value),
    [0, null],
  );
  assert.deepEqual(chartDomain(normalized[0]), { min: 0, max: 1 });
  const converted = chartPanels(
    rows,
    periods,
    false,
    "converted",
    { [chartSeriesKey(rows[0])]: "0" },
    "",
  );
  assert.equal(converted[0].unit, "value");
  assert.equal(converted[0].series[0].points[0].value, 0);
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
