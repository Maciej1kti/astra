import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultTileMetrics,
  tileMetrics,
  tileSelection,
  tileValues,
  withTileSelection,
} from "../../apps/web/src/features/charts/chart-tiles.ts";

test("a tile shows its saved choice in catalogue order, or the default", () => {
  assert.ok(
    tileMetrics.every((metric) => /^[a-z][a-z0-9-]{1,39}$/.test(metric.id)),
  );
  assert.ok(tileMetrics.length <= 16, "Every value fits the stored bound");
  assert.deepEqual(tileSelection(undefined, "a"), [...defaultTileMetrics]);
  assert.deepEqual(tileSelection({ b: ["rate"] }, "a"), [
    ...defaultTileMetrics,
  ]);
  assert.deepEqual(
    tileSelection({ a: ["value", "retired-metric", "total"] }, "a"),
    ["total", "value"],
  );
  assert.deepEqual(tileSelection({ a: [] }, "a"), []);
});

test("one counter's choice replaces its entry; the default is stored as none", () => {
  const saved = { a: ["total"], b: ["rate"] };
  assert.deepEqual(
    withTileSelection(saved, "a", ["value", "total"], ["a", "b"]),
    {
      a: ["total", "value"],
      b: ["rate"],
    },
  );
  assert.deepEqual(
    withTileSelection(saved, "a", [...defaultTileMetrics].reverse(), [
      "a",
      "b",
    ]),
    { b: ["rate"] },
  );
  assert.deepEqual(withTileSelection(undefined, "c", [], []), { c: [] });
  assert.deepEqual(saved, { a: ["total"], b: ["rate"] });
  const full = Object.fromEntries(
    Array.from({ length: 200 }, (_, index) => [`gone-${index}`, ["rate"]]),
  );
  const next = withTileSelection(full, "live", ["total"], ["live"]);
  assert.equal(Object.keys(next).length, 200);
  assert.deepEqual(next.live, ["total"]);
});

test("tile values come from the range, the whole history and the rate", () => {
  const row = (name, total, extra = {}) => ({
    source: {
      name,
      unit: "rep",
      history: { total: 1300, recorded: 2, first_date: "2026-01-01" },
      ...extra.source,
    },
    stats: {
      total,
      recorded: 2,
      average: total / 2,
      peak: 200,
      peakDate: "2026-10-06",
      lastValue: 100,
      lastDate: "2026-10-07",
    },
    rate: "rate" in extra ? extra.rate : 0.25,
  });
  const first = row("Pompki Tomek", 300);
  const second = row("Pompki Maciek", 100, { rate: null });
  const values = tileValues(first, [first, second], 30, "PLN");
  assert.deepEqual(
    Object.keys(values),
    tileMetrics.map((metric) => metric.id),
  );
  assert.deepEqual(values.total, { value: "300", note: "rep" });
  assert.equal(values["history-total"].value, "1300");
  assert.match(values["history-total"].note, /^rep od 1 sty 2026$/);
  assert.equal(values.recorded.value, "2");
  assert.equal(values.average.value, "150");
  assert.equal(values["daily-average"].value, "10");
  assert.equal(values.peak.value, "200");
  assert.equal(values.last.value, "100");
  assert.deepEqual(values.difference, {
    value: "—",
    note: "Punkt odniesienia",
  });
  assert.deepEqual(values.rate, { value: "0,25", note: "PLN za rep" });
  assert.deepEqual(values.value, { value: "75", note: "PLN" });
  assert.equal(values["history-value"].value, "325");
  const other = tileValues(second, [first, second], 30, "");
  assert.deepEqual(other.difference, {
    value: "-200 rep",
    note: "wobec: Pompki Tomek",
  });
  assert.deepEqual(other.rate, { value: "—", note: "Ustaw w liczniku" });
  assert.deepEqual(other.value, { value: "—", note: "Bez stawki" });
  assert.equal(
    tileValues(first, [first], 30, "PLN").difference.note,
    "Jedyny w tej jednostce",
  );
});
