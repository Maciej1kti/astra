import test from "node:test";
import assert from "node:assert/strict";
import {
  readRoute,
  writeRoute,
  searchOnlyNavigation,
  primaryResource,
} from "../../apps/web/src/features/workspace/navigation.ts";

const project = "11111111-1111-4111-8111-111111111111";
const card = "22222222-2222-4222-8222-222222222222";
const today = "2026-09-08";

test("calendar deep links retain day and layout through reload and browser history", () => {
  const route = readRoute(
    new URLSearchParams("view=calendar&date=2026-10-13&layout=week"),
    today,
  );
  assert.equal(route.calendarDate, "2026-10-13");
  assert.equal(route.calendarLayout, "week");
  assert.deepEqual(readRoute(writeRoute(route), today), route);
});

test("legacy month links and invalid dates resolve deterministically", () => {
  assert.equal(
    readRoute(new URLSearchParams("view=calendar&month=2026-10"), today)
      .calendarDate,
    "2026-10-01",
  );
  const route = readRoute(
    new URLSearchParams(
      "view=unknown&date=2026-02-30&layout=unknown&project=bad",
    ),
    today,
  );
  assert.equal(route.view, "focus");
  assert.equal(route.calendarDate, today);
  assert.equal(route.calendarLayout, "month");
  assert.equal(route.project, "");
});

test("opening a resource from All projects retains the workspace filter", () => {
  const route = readRoute(
    new URLSearchParams(
      `view=focus&resource_project=${project}&resource=${card}&type=card`,
    ),
    today,
  );
  const saved = writeRoute(route);
  assert.equal(saved.has("project"), false);
  assert.equal(readRoute(saved, today).resource.project, project);
  assert.equal(readRoute(saved, today).project, "");
});

test("archive and exact tag filters survive links, including literal commas", () => {
  const params = new URLSearchParams({
    view: "list",
    project,
    archived: "true",
    label: "Research, discovery",
    status: "active",
    priority: "high",
  });
  const route = readRoute(params, today);
  assert.deepEqual(readRoute(writeRoute(route), today), route);
  route.view = "board";
  const board = writeRoute(route);
  for (const name of ["archived", "label", "status", "priority"])
    assert.equal(board.has(name), false);
});

test("typed search replaces an entry while semantic navigation creates one", () => {
  assert.equal(
    searchOnlyNavigation(
      new URLSearchParams("view=list&q=one"),
      new URLSearchParams("q=two&view=list"),
    ),
    true,
  );
  for (const query of [
    "view=board",
    "view=list&archived=true",
    "view=list&label=qa",
    `view=list&resource=${card}`,
  ])
    assert.equal(
      searchOnlyNavigation(
        new URLSearchParams("view=list"),
        new URLSearchParams(query),
      ),
      false,
    );
});

test("list collection cannot contaminate create actions in other views", () => {
  for (const view of ["focus", "board", "calendar", "gantt", "projects"])
    assert.equal(primaryResource(view, "milestones"), "card");
  assert.equal(primaryResource("list", "milestones"), "milestone");
  assert.equal(primaryResource("list", "cards"), "card");
  assert.equal(primaryResource("updates", "milestones"), "update");
});
