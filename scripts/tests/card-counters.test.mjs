import test from "node:test";
import assert from "node:assert/strict";
import {
  counterRecord,
  emptyCounterDrafts,
  countersDirty,
  counterRate,
  validCounterConfiguration,
  parseCounterInput,
  setCounterInput,
  setCounterValue,
} from "../../apps/web/src/features/cards/card-counters.ts";
import { calendarToday } from "../../apps/web/src/lib/ui/calendar-dates.ts";

const counter = {
  id: "counter",
  name: "Push-ups",
  unit: "reps",
  step: 5,
  archived: false,
  values: { "2026-09-26": 10 },
};
test("counter value drafts are local, reversible and retain saved history", () => {
  let draft = emptyCounterDrafts();
  assert.equal(counterRecord(counter, draft, "2026-09-26").value, 10);
  draft = setCounterValue(counter, draft, "2026-09-26", 15);
  assert.equal(draft.values.counter.value, 15);
  assert.equal(counter.values["2026-09-26"], 10);
  draft = setCounterValue(counter, draft, "2026-09-26", 10);
  assert.equal(countersDirty(draft), false);
  draft = setCounterValue(counter, draft, "2026-09-26", 0);
  assert.equal(draft.values.counter.value, 0);
  assert.equal(
    validCounterConfiguration({
      name: "Push-ups",
      unit: "reps",
      step: 0,
      archived: false,
    }),
    false,
  );
});

test("numeric drafts preserve incomplete input, bounds and their original day", () => {
  let draft = setCounterInput(counter, emptyCounterDrafts(), "2026-09-26", "");
  assert.equal(countersDirty(draft), true);
  assert.equal(draft.inputs.counter.text, "");
  assert.equal(counterRecord(counter, draft, "2026-09-27").date, "2026-09-26");
  draft = setCounterInput(counter, draft, "2026-09-27", "17");
  assert.deepEqual(draft.values.counter, {
    id: "counter",
    date: "2026-09-26",
    value: 17,
  });
  draft = setCounterInput(counter, draft, "2026-09-27", "1e3");
  assert.equal(draft.inputs.counter.text, "1e3");
  assert.equal(draft.values.counter.value, 17);
  draft = setCounterInput(counter, draft, "2026-09-27", "10");
  assert.equal(countersDirty(draft), false);
  assert.deepEqual(draft.values, {});
  assert.equal(counter.values["2026-09-26"], 10);
  for (const invalid of ["", " ", "-1", "1.5", "1e3", "NaN", "1000000001"])
    assert.equal(parseCounterInput(invalid), null);
  assert.equal(parseCounterInput("0"), 0);
  assert.equal(parseCounterInput("1000000000"), 1_000_000_000);
  for (const invalid of [-1, 1.5, NaN, Infinity, 1_000_000_001])
    assert.equal(setCounterValue(counter, draft, "2026-09-27", invalid), draft);
});
test("workspace midnight resets the view without deleting history or moving an unsaved result", () => {
  const instant = Date.parse("2026-09-26T22:30:00Z");
  assert.equal(calendarToday("Europe/Warsaw", instant), "2026-09-27");
  assert.equal(calendarToday("America/Los_Angeles", instant), "2026-09-26");
  let draft = setCounterValue(counter, emptyCounterDrafts(), "2026-09-26", 15);
  assert.equal(counterRecord(counter, draft, "2026-09-27").date, "2026-09-26");
  draft = setCounterValue(counter, draft, "2026-09-27", 20);
  assert.deepEqual(draft.values.counter, {
    id: "counter",
    date: "2026-09-26",
    value: 20,
  });
  assert.equal(
    counterRecord(counter, emptyCounterDrafts(), "2026-09-27").value,
    0,
  );
  assert.equal(counter.values["2026-09-26"], 10);
});

test("a typed rate becomes an exact stored decimal, null when empty", () => {
  for (const [text, stored] of [
    ["", null],
    ["  ", null],
    [undefined, null],
    ["1", "1"],
    ["0,25", "0.25"],
    [" 0.25 ", "0.25"],
    [",5", "0.5"],
    ["007", "7"],
    ["1.50", "1.50"],
    ["999999999.9999", "999999999.9999"],
  ])
    assert.equal(counterRate(text), stored, String(text));
  for (const text of [
    "-1",
    "1.",
    ".",
    "1,2,3",
    "0.12345",
    "1234567890",
    "1e3",
    "abc",
  ])
    assert.equal(counterRate(text), undefined, text);
  const config = { name: "Sit-ups", unit: "rep", step: 1, archived: false };
  assert.equal(validCounterConfiguration({ ...config, rate: "0,25" }), true);
  assert.equal(validCounterConfiguration({ ...config, rate: "" }), true);
  assert.equal(validCounterConfiguration(config), true);
  assert.equal(validCounterConfiguration({ ...config, rate: "x" }), false);
});
