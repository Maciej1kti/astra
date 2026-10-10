import { test } from "node:test";
import assert from "node:assert/strict";
import { resourceDates } from "../../apps/web/src/lib/resources/resource-presentation.ts";

test("card summaries retain multi-day planned work", () => {
  const card = {
    type: "card",
    schedule: { start: "2026-09-10", end: "2026-09-15" },
  };
  assert.deepEqual(resourceDates(card), [
    { kind: "plan", label: "Plan", start: "2026-09-10", end: "2026-09-15" },
  ]);
  assert.equal(card.schedule.end, "2026-09-15");
});

test("milestone summaries retain date-only due values", () => {
  assert.deepEqual(
    resourceDates({
      type: "milestone",
      due: { date: "2026-09-20" },
    }),
    [{ kind: "due", label: "Termin", start: "2026-09-20" }],
  );
});

test("one-day planned work keeps its inclusive date", () => {
  assert.deepEqual(
    resourceDates({
      type: "card",
      schedule: { start: "2026-09-08", end: "2026-09-08" },
    }),
    [{ kind: "plan", label: "Plan", start: "2026-09-08" }],
  );
});

test("card summaries do not present retired due or review dates", () => {
  assert.deepEqual(
    resourceDates({
      type: "card",
      due: { date: "2026-09-08" },
      review_on: "2026-09-09",
    }),
    [],
  );
});

test("a goal shows the span of its cards' dates, not dates of its own", () => {
  assert.deepEqual(
    resourceDates({
      type: "project",
      span: { start: "2026-09-28", end: "2026-11-03" },
    }),
    [
      {
        kind: "plan",
        label: "Daty kart",
        start: "2026-09-28",
        end: "2026-11-03",
      },
    ],
  );
  assert.deepEqual(
    resourceDates({
      type: "project",
      span: { start: "2026-09-28", end: "2026-09-28" },
    }),
    [{ kind: "plan", label: "Daty kart", start: "2026-09-28" }],
  );
  assert.deepEqual(resourceDates({ type: "project" }), []);
  // A span reported on anything but a goal is not presented as its plan.
  assert.deepEqual(
    resourceDates({
      type: "card",
      span: { start: "2026-09-28", end: "2026-11-03" },
    }),
    [],
  );
});
