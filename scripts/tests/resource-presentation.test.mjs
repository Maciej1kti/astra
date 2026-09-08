import { test } from "node:test";
import assert from "node:assert/strict";
import { resourceDates } from "../../apps/web/src/lib/resource-presentation.ts";

test("card summaries retain the distinct meanings of deadline, plan and review", () => {
  const card = {
    due: { date: "2026-09-02", kind: "hard" },
    schedule: { start: "2026-09-10", end: "2026-09-15" },
    review_on: "2026-09-08",
  };
  assert.deepEqual(resourceDates(card), [
    { kind: "hard", label: "Hard deadline", start: "2026-09-02" },
    { kind: "plan", label: "Plan", start: "2026-09-10", end: "2026-09-15" },
    { kind: "review", label: "Review", start: "2026-09-08" },
  ]);
  assert.equal(card.due.date, "2026-09-02");
  assert.equal(card.schedule.end, "2026-09-15");
});

test("a target date never claims to be a hard deadline or substitutes a plan date", () => {
  assert.deepEqual(
    resourceDates({
      due: { date: "2026-09-20", kind: "target" },
      schedule: { start: "2026-09-08", end: "2026-09-08" },
    }),
    [
      { kind: "target", label: "Target date", start: "2026-09-20" },
      { kind: "plan", label: "Plan", start: "2026-09-08" },
    ],
  );
  assert.deepEqual(resourceDates({}), []);
});
