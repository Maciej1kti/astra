import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustCounter,
  counterRecord,
  counterDay,
  emptyCounterDrafts,
  countersDirty,
  validCounterConfiguration,
} from "../../apps/web/src/features/cards/card-counters.ts";

const counter = {
  id: "counter",
  name: "Push-ups",
  unit: "reps",
  step: 5,
  archived: false,
  values: { "2026-09-26": 10 },
};
test("counter clicks are local, reversible and respect configured steps and zero", () => {
  let draft = emptyCounterDrafts();
  assert.equal(counterRecord(counter, draft, "2026-09-26").value, 10);
  draft = adjustCounter(counter, draft, "2026-09-26", 1);
  assert.equal(draft.values.counter.value, 15);
  assert.equal(counter.values["2026-09-26"], 10);
  draft = adjustCounter(counter, draft, "2026-09-26", -1);
  assert.equal(countersDirty(draft), false);
  for (let i = 0; i < 5; i++)
    draft = adjustCounter(counter, draft, "2026-09-26", -1);
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
test("workspace midnight resets the view without deleting history or moving an unsaved result", () => {
  const instant = Date.parse("2026-09-26T22:30:00Z");
  assert.equal(counterDay("Europe/Warsaw", instant), "2026-09-27");
  assert.equal(counterDay("America/Los_Angeles", instant), "2026-09-26");
  let draft = adjustCounter(counter, emptyCounterDrafts(), "2026-09-26", 1);
  assert.equal(counterRecord(counter, draft, "2026-09-27").date, "2026-09-26");
  draft = adjustCounter(counter, draft, "2026-09-27", 1);
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
