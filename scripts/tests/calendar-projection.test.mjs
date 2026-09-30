import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarEventProjection,
  calendarEvents,
} from "../../apps/web/src/features/planning/calendar-events.ts";

const plan = {
  project_id: "project",
  resource_id: "card",
  item_id: "card:plan",
  title: "Work",
  kind: "card_schedule",
  start: "2026-09-01",
  end: "2026-09-03",
  version: "observed-1",
};
const due = { ...plan, item_id: "milestone:due", kind: "milestone_due" };

test("identical fresh reads and equivalent filters retain the displayed events", () => {
  const project = calendarEventProjection();
  const first = project([plan, due], "", true);
  assert.deepEqual(first, calendarEvents([plan, due], "", true));
  assert.equal(project(structuredClone([plan, due]), "WORK", true), first);
  assert.equal(project(structuredClone([plan, due]), "work", true), first);
  assert.equal(first[0].extendedProps.astra.version, "observed-1");
  assert.equal(first[0].end, "2026-09-04");
});

test("a newer version or changed projection data replaces the event and its observed metadata", () => {
  const project = calendarEventProjection();
  let first = project([plan, due], "", true);
  const newer = { ...plan, version: "observed-2" };
  let next = project([newer, structuredClone(due)], "", true);
  assert.notEqual(next, first);
  assert.notEqual(next[0], first[0]);
  assert.equal(next[1], first[1]);
  assert.equal(next[0].extendedProps.astra.version, "observed-2");
  // Dates can change independently of the source version in a projection.
  first = next;
  const changed = { ...newer, title: "Updated", end: "2026-09-05" };
  next = project([changed, due], "", true);
  assert.equal(next[0].title, "Updated");
  assert.equal(next[0].end, "2026-09-06");
  assert.notEqual(next[0], first[0]);
  assert.equal(next[1], first[1]);
});

test("timed metadata and caller mutations never silently alter a retained snapshot", () => {
  const project = calendarEventProjection();
  const timed = {
    ...plan,
    kind: "card_event",
    event: { start: "2026-09-01T09:30", duration_minutes: 30 },
  };
  const first = project([timed], "", true);
  timed.title = "Changed";
  timed.event.duration_minutes = 90;
  assert.equal(first[0].title, "Work");
  assert.equal(first[0].extendedProps.astra.event.duration_minutes, 30);
  const next = project([timed], "", true);
  assert.notEqual(next[0], first[0]);
  assert.equal(next[0].end, "2026-09-01T11:00");
  assert.equal(next[0].title, "Changed");
});

test("readiness, order and membership remain explicit and old pages are evicted", () => {
  const project = calendarEventProjection();
  const first = project([plan, due], "", true);
  const locked = project(structuredClone([plan, due]), "", false);
  assert.equal(locked[0].editable, false);
  assert.equal(locked[0].startEditable, false);
  assert.equal(locked[0].durationEditable, false);
  assert.equal(locked[1], first[1]);
  const restored = project([plan, due], "", true);
  assert.equal(restored[0].editable, true);
  const reordered = project([due, plan], "", true);
  assert.deepEqual(reordered, [restored[1], restored[0]]);
  assert.notEqual(reordered, restored);
  const remaining = project([plan], "", true);
  assert.equal(remaining[0], restored[0]);
  const returned = project([plan, due], "", true);
  assert.notEqual(returned[1], restored[1]);
  assert.deepEqual(project([plan, due], "missing", true), []);
  const cleared = project([plan], "", true);
  assert.notEqual(cleared[0], remaining[0]);
});
