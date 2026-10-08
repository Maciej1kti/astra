import test from "node:test";
import assert from "node:assert/strict";
import {
  arrivedDates,
  chooseDates,
  settleDates,
  shownDates,
} from "../../apps/web/src/features/planning/timeline-pending.ts";

const first = { start: "2026-09-08", end: "2026-09-10" };
const second = { start: "2026-09-09", end: "2026-09-12" };
const third = { start: "2026-09-01", end: "2026-09-02" };

test("a first change is proposed against the version the gesture observed", () => {
  const step = chooseDates(undefined, "v1", first);
  assert.deepEqual(step.propose, { version: "v1", dates: first });
  assert.deepEqual(shownDates(step.entry), first);
  assert.equal(shownDates(undefined), null);
});

test("a read never supplies the version of a change", () => {
  let { entry } = chooseDates(undefined, "v1", first);
  // The card changed elsewhere while the save is on its way.
  entry = arrivedDates(entry, "elsewhere");
  assert.deepEqual(shownDates(entry), first, "the bar waits for its answer");
  // The server refuses the stale version; nothing is retried on the new one.
  assert.deepEqual(settleDates(entry, false), {});
});

test("dates chosen during a save follow on the version that save produced", () => {
  let { entry } = chooseDates(undefined, "v1", first);
  let step = chooseDates(entry, "v1", second);
  assert.equal(step.propose, undefined, "one save at a time for a row");
  assert.deepEqual(shownDates(step.entry), second);
  step = chooseDates(step.entry, "v1", third);
  assert.deepEqual(shownDates(step.entry), third, "the latest choice wins");
  step = settleDates(step.entry, true, "v2");
  assert.deepEqual(step.propose, { version: "v2", dates: third });
  entry = step.entry;
  assert.deepEqual(shownDates(entry), third);
  // Reads from before either change, and of the first save, keep the bar.
  assert.equal(arrivedDates(entry, "v1"), entry);
  assert.equal(arrivedDates(entry, "v2"), entry);
  step = settleDates(entry, true, "v3");
  assert.equal(step.propose, undefined);
  assert.equal(arrivedDates(step.entry, "v2"), step.entry);
  assert.equal(arrivedDates(step.entry, "v3"), undefined, "the saved row");
});

test("a change after a settled save builds on its version before any read", () => {
  let { entry } = chooseDates(undefined, "v1", first);
  ({ entry } = settleDates(entry, true, "v2"));
  const step = chooseDates(entry, "v1", second);
  assert.deepEqual(step.propose, { version: "v2", dates: second });
  // A competing edit made v9; the proposal above stays on v2 and conflicts.
  assert.equal(arrivedDates(step.entry, "v9"), step.entry);
  assert.deepEqual(settleDates(step.entry, false), {});
});

test("a refused change takes the dates waiting on it with it", () => {
  let { entry } = chooseDates(undefined, "v1", first);
  ({ entry } = chooseDates(entry, "v1", second));
  assert.deepEqual(settleDates(entry, false), {});
});

test("a settled change gives way to whatever is read next", () => {
  let { entry } = chooseDates(undefined, "v1", first);
  ({ entry } = settleDates(entry, true, "v2"));
  assert.equal(arrivedDates(entry, "v1"), entry, "a read from before it");
  assert.equal(arrivedDates(entry, "v2"), undefined);
  assert.equal(arrivedDates(entry, "v7"), undefined, "changed again elsewhere");
  assert.equal(arrivedDates(entry, undefined), undefined, "the row is gone");
});

test("a save without a version cannot be built on", () => {
  let { entry } = chooseDates(undefined, "v1", first);
  ({ entry } = chooseDates(entry, "v1", second));
  let step = settleDates(entry, true);
  assert.equal(step.propose, undefined);
  assert.deepEqual(
    shownDates(step.entry),
    first,
    "the waiting dates are dropped",
  );
  step = chooseDates(step.entry, "v1", third);
  assert.equal(step.propose, undefined, "until the saved row is read");
  assert.equal(arrivedDates(step.entry, "v2"), undefined);
});
