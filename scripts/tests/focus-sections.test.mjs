import test from "node:test";
import assert from "node:assert/strict";
import { focusSections } from "../../apps/web/src/features/workspace/screens/focus-sections.ts";

const route = (overrides = {}) => ({
  view: "focus",
  project: "",
  search: "",
  archived: false,
  ...overrides,
});

const card = (project_id, id, title, extra = {}) => ({
  type: "card",
  project_id,
  id,
  title,
  status: "active",
  ...extra,
});

const attention = (project_id, type, id, reason, label) => ({
  id: `${type}-${id}-${reason}`,
  project_id,
  target: { type, id },
  reason,
  label,
});

test("focus sections retain cards with and without schedules", () => {
  const minimal = card("p", "minimal", "Minimal card");
  const scheduled = card("p", "scheduled", "Scheduled card", {
    schedule: { start: "2026-09-22", end: "2026-09-24" },
    priority: "high",
    labels: ["release"],
    acceptance_progress: { completed: 1, total: 2 },
  });
  const result = focusSections([minimal, scheduled], [minimal], [], route());

  assert.deepEqual(
    result.focusCards.map((item) => item.id),
    ["minimal"],
  );
  assert.deepEqual(result.activeCards, [scheduled]);
  assert.equal(result.activeCards[0].schedule.start, "2026-09-22");
});

test("focus precedence and attention deduplication use project and target type", () => {
  const pinned = card("p1", "same", "Pinned");
  const active = card("p1", "next", "Next");
  const otherProject = card("p2", "same", "Other project");
  const rows = [
    attention("p1", "card", "same", "overdue", "Pinned"),
    attention("p1", "card", "same", "review", "Pinned"),
    attention("p1", "milestone", "same", "due_soon", "Milestone"),
    attention("p2", "card", "same", "overdue", "Other project"),
  ];

  const result = focusSections(
    [pinned, active, otherProject],
    [pinned],
    rows,
    route(),
  );

  assert.deepEqual(result.focusCards[0].attentionReasons, [
    "overdue",
    "review",
  ]);
  assert.deepEqual(
    result.attention.map((item) => [
      item.project_id,
      item.target.type,
      item.target.id,
    ]),
    [
      ["p1", "milestone", "same"],
      ["p2", "card", "same"],
    ],
  );
  assert.deepEqual(result.activeCards, [active]);
});

test("focus filters apply to folders and loaded titles, ignoring the prior project", () => {
  const result = focusSections(
    [
      card("p1", "keep", "Keep this"),
      card("p2", "other", "Keep other"),
      card("p1", "search", "Different"),
    ],
    [],
    [attention("p1", "card", "keep", "overdue", "Keep this")],
    route({ project: "p2", folder: "Work", search: "keep" }),
    [
      { id: "p1", folder: "Work" },
      { id: "p2", folder: "Home" },
    ],
  );

  assert.deepEqual(result.activeCards, []);
  assert.deepEqual(
    result.attention.map((item) => item.target.id),
    ["keep"],
  );
});

test("one folder includes multiple projects while All folders also includes unassigned projects", () => {
  const projects = [
    { id: "p1", folder: "Work" },
    { id: "p2", folder: "Work" },
    { id: "p3", folder: "Home" },
    { id: "p4" },
  ];
  const cards = projects.map((p) => card(p.id, p.id, p.id));
  const filtered = focusSections(
    cards,
    [cards[0], cards[2]],
    [],
    route({ folder: "Work", project: "p3" }),
    projects,
  );
  assert.deepEqual(
    filtered.focusCards.map((p) => p.id),
    ["p1"],
  );
  assert.deepEqual(
    filtered.activeCards.map((p) => p.id),
    ["p2"],
  );
  assert.equal(
    focusSections(cards, [], [], route({ project: "p3" }), projects).activeCards
      .length,
    4,
  );
});

test("pins retain archived and completed cards and outrank today's events", () => {
  const archived = card("p", "archive", "Archived pin", {
    archived: true,
    status: "done",
  });
  const event = card("p", "event", "Pinned event", {
    event: { start: "2026-10-01T10:00", duration_minutes: 60 },
  });
  const visibleEvent = card("p", "visible", "Today's event", {
    status: "planned",
  });
  const result = focusSections(
    [],
    [archived, event],
    [],
    route(),
    [],
    [event, visibleEvent],
  );
  assert.deepEqual(
    result.focusCards.map((i) => i.id),
    ["archive", "event"],
  );
  assert.deepEqual(result.eventCards, [visibleEvent]);
});
