import test from "node:test";
import assert from "node:assert/strict";
import {
  money,
  settle,
  settlementPerson,
} from "../../apps/web/src/features/charts/plugins/settlement/settlement.ts";
import { chartTotals } from "../../apps/web/src/features/charts/plugins/totals/totals.ts";
import {
  pluginIds,
  pluginList,
  plugins,
  togglePlugin,
} from "../../apps/web/src/lib/plugins/registry.ts";

test("a settlement names people by the last word and has the lower value pay the difference", () => {
  assert.equal(settlementPerson("Pompki Tomek"), "Tomek");
  assert.equal(settlementPerson("  Brzuszki   poranne Maciek "), "Maciek");
  assert.equal(settlementPerson("Push-ups"), null);
  const row = (name, total, rate) => ({
    source: { name },
    stats: { total },
    rate,
    color: 0,
  });
  const settlement = settle([
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
  assert.equal(money(269.67).replace(/\s/g, " "), "269,67");
  assert.equal(money(270), "270,00");

  const three = settle([
    row("A Ola", 10, 1),
    row("A Ala", 30, 1),
    row("A Ela", 10, 1),
  ]);
  assert.deepEqual(
    three.debts.map((debt) => [debt.from, debt.to, debt.amount]),
    [
      ["Ela", "Ala", 20],
      ["Ola", "Ala", 20],
    ],
  );
  const owner = settle([
    row("Pompki Tomek", 15650, 1),
    row("Pompki Maciek", 358, 1),
    row("Brzuszki Tomek", 15650, 0.25),
    row("Brzuszki Maciek", 30, 0.25),
  ]);
  assert.deepEqual(owner.debts, [
    { from: "Maciek", to: "Tomek", amount: 19197 },
  ]);
  const unratedOnly = settle([
    row("Pompki Tomek", 5, null),
    row("Pompki Maciek", 3, null),
  ]);
  assert.deepEqual(
    [unratedOnly.people, unratedOnly.parties.length, unratedOnly.debts.length],
    [2, 0, 0],
  );
});

test("a debt counts a counter's whole history when the series carries it", () => {
  const row = (name, inRange, history) => ({
    source: { name, history: { total: history, recorded: 1 } },
    stats: { total: inRange },
    rate: 1,
    color: 0,
  });
  assert.deepEqual(
    settle([row("Pompki Tomek", 300, 1300), row("Pompki Maciek", 33, 33)])
      .debts,
    [{ from: "Maciek", to: "Tomek", amount: 1267 }],
  );
});

test("totals add one unit, count records and value only rated counters", () => {
  const row = (unit, total, recorded, rate) => ({
    source: { unit },
    stats: { total, recorded },
    rate,
  });
  assert.deepEqual(
    chartTotals([row("rep", 60, 4, 2.5), row("rep", 80, 3, null)]),
    {
      total: 140,
      unit: "rep",
      records: 7,
      converted: 150,
      rated: 1,
      counters: 2,
    },
  );
  const mixed = chartTotals([row("rep", 60, 4, 2.5), row("h", 10, 3, 100)]);
  assert.equal(mixed.total, null);
  assert.equal(mixed.converted, 1150);
  const empty = chartTotals([row("rep", 0, 0, 1)]);
  assert.deepEqual([empty.total, empty.converted], [null, null]);
});

test("the plugin registry keeps one spelling of an enabled set and unknown identifiers", () => {
  assert.deepEqual(
    plugins.map((plugin) => plugin.id),
    ["chart-totals", "chart-settlement"],
  );
  assert.ok(
    plugins.every((plugin) => /^[a-z][a-z0-9-]{1,39}$/.test(plugin.id)),
  );
  assert.equal(pluginList(undefined), "");
  assert.equal(pluginList(["b-two", "a-one", "b-two"]), "a-one,b-two");
  assert.deepEqual(pluginIds(""), []);
  let list = togglePlugin("future-plugin", "chart-totals", true);
  assert.equal(list, "chart-totals,future-plugin");
  list = togglePlugin(list, "chart-totals", false);
  assert.equal(list, "future-plugin");
});
