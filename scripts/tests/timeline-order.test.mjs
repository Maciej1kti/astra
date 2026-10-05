import test from "node:test";
import assert from "node:assert/strict";
import {
  moveTimelineRow,
  orderedTimelineRows,
  readTimelineOrder,
  writeTimelineOrder,
} from "../../apps/web/src/features/planning/timeline-order.ts";

const key = (project) => `astra-timeline-order:v1:${project}`;

function storage(t, overrides = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const fake = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => void values.set(name, String(value)),
    ...overrides,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: fake,
    configurable: true,
    writable: true,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  });
  return values;
}

test("a written Timeline order is read back for its own project only", (t) => {
  const values = storage(t);
  assert.deepEqual(readTimelineOrder("alpha"), []);
  assert.equal(writeTimelineOrder("alpha", ["b", "a", "c"]), true);
  assert.deepEqual(readTimelineOrder("alpha"), ["b", "a", "c"]);
  assert.deepEqual(readTimelineOrder("beta"), []);
  assert.equal(writeTimelineOrder("beta", []), true);
  assert.deepEqual(readTimelineOrder("beta"), []);
  assert.deepEqual(JSON.parse(values.get(key("alpha"))), ["b", "a", "c"]);
  assert.equal(values.size, 2);
});

test("corrupt or foreign stored Timeline orders read as no preference", (t) => {
  const values = storage(t);
  for (const stored of [
    "",
    "{",
    "not json",
    "null",
    "true",
    "42",
    '"a"',
    '{"0":"a","length":1}',
  ]) {
    values.set(key("alpha"), stored);
    assert.deepEqual(readTimelineOrder("alpha"), [], stored);
  }
});

test("a stored Timeline order keeps only the first occurrence of each string id", (t) => {
  const values = storage(t);
  values.set(
    key("alpha"),
    JSON.stringify(["b", 1, null, "a", ["c"], { id: "d" }, "b", "a", "c"]),
  );
  assert.deepEqual(readTimelineOrder("alpha"), ["b", "a", "c"]);
});

test("Timeline orders are bounded to ten thousand rows in both directions", (t) => {
  const values = storage(t);
  const ids = Array.from({ length: 10002 }, (_, index) => `row-${index}`);
  assert.equal(writeTimelineOrder("alpha", ids), true);
  const written = JSON.parse(values.get(key("alpha")));
  assert.equal(written.length, 10000);
  assert.equal(written.at(-1), "row-9999");
  assert.equal(ids.length, 10002);
  // Duplicates do not consume the read bound.
  values.set(key("alpha"), JSON.stringify(["row-0", ...ids]));
  const read = readTimelineOrder("alpha");
  assert.equal(read.length, 10000);
  assert.equal(read[0], "row-0");
  assert.equal(read.at(-1), "row-9999");
});

test("unavailable or failing browser storage degrades to no order and a reported failed write", (t) => {
  storage(t, {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  });
  assert.deepEqual(readTimelineOrder("alpha"), []);
  assert.equal(writeTimelineOrder("alpha", ["a"]), false);
  globalThis.localStorage = undefined;
  assert.deepEqual(readTimelineOrder("alpha"), []);
  assert.equal(writeTimelineOrder("alpha", ["a"]), false);
});

test("rows follow the preferred order and unknown rows keep their own order at the end", () => {
  const rows = ["a", "b", "c", "d", "e"].map((id) => ({ id, title: id }));
  const snapshot = [...rows];
  const ordered = orderedTimelineRows(rows, ["d", "missing", "b"]);
  assert.deepEqual(
    ordered.map((row) => row.id),
    ["d", "b", "a", "c", "e"],
  );
  assert.equal(ordered[0], rows[3]);
  assert.deepEqual(rows, snapshot);
  assert.notEqual(ordered, rows);
});

test("an empty or unrelated order leaves the rows as supplied", () => {
  const rows = [{ id: "b" }, { id: "a" }, { id: "c" }];
  for (const order of [[], ["x", "y"]])
    assert.deepEqual(orderedTimelineRows(rows, order), rows);
  assert.deepEqual(orderedTimelineRows([], ["a"]), []);
});

test("a Timeline row moves to an occupied destination in either direction", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(moveTimelineRow(order, "a", 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveTimelineRow(order, "a", 3), ["b", "c", "d", "a"]);
  assert.deepEqual(moveTimelineRow(order, "d", 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveTimelineRow(order, "c", 1), ["a", "c", "b", "d"]);
  assert.deepEqual(moveTimelineRow(order, "b", 1), order);
  assert.deepEqual(moveTimelineRow(["a"], "a", 0), ["a"]);
  assert.deepEqual(order, ["a", "b", "c", "d"]);
});

test("an unknown row or an out-of-range destination returns an unchanged copy", () => {
  const order = ["a", "b", "c"];
  for (const [id, destination] of [
    ["missing", 1],
    ["a", -1],
    ["a", 3],
    ["c", 99],
  ]) {
    const result = moveTimelineRow(order, id, destination);
    assert.deepEqual(result, order);
    assert.notEqual(result, order);
  }
  assert.deepEqual(moveTimelineRow([], "a", 0), []);
});
