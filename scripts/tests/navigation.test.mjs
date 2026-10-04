import test from "node:test";
import assert from "node:assert/strict";
import {
  readRoute,
  writeRoute,
  searchOnlyNavigation,
  primaryResource,
  workspaceViews,
} from "../../apps/web/src/features/workspace/navigation.ts";
import {
  readNavigationLayout,
  writeNavigationLayout,
} from "../../apps/web/src/features/workspace/navigation-layout.ts";

const project = "11111111-1111-4111-8111-111111111111";
const card = "22222222-2222-4222-8222-222222222222";
const today = "2026-09-08";

test("retired Main links resolve to Projects with project opening and folder scope", () => {
  const route = readRoute(
    new URLSearchParams({
      view: "main",
      folder: "Work & Home",
      resource_project: project,
      resource: project,
      type: "project",
      q: "Astra",
    }),
    today,
  );
  assert.equal(route.view, "projects");
  assert.equal(route.project, "");
  assert.equal(writeRoute(route).get("view"), "projects");
  assert.equal(writeRoute(route).get("folder"), "Work & Home");
  assert.deepEqual(readRoute(writeRoute(route), today), route);
  assert.equal(
    readRoute(new URLSearchParams(), today, "main").view,
    "projects",
  );
});

test("retired Main shortcuts collapse into Projects without rewriting storage on read", () => {
  const saved = {
    order: ["chart", "main", "focus", "projects", "list"],
    visible: ["main", "focus", "projects"],
  };
  const original = JSON.stringify(saved);
  let stored = original;
  const storage = {
    getItem: () => stored,
    setItem: (_key, value) => (stored = value),
  };
  const layout = readNavigationLayout(storage);
  assert.deepEqual(layout.order, [
    "chart",
    "projects",
    "focus",
    "list",
    "board",
    "calendar",
    "gantt",
    "updates",
  ]);
  assert.deepEqual(layout.visible, ["projects", "focus"]);
  assert.equal(stored, original);
  assert.equal(layout.order.length, workspaceViews.length);
  assert.equal(writeNavigationLayout(layout, storage), true);
  assert.deepEqual(JSON.parse(stored), layout);
  assert.equal(JSON.parse(stored).order.includes("main"), false);
  assert.deepEqual(
    readNavigationLayout({
      getItem: () => JSON.stringify({ order: ["main"], visible: ["main"] }),
    }).visible,
    ["projects"],
  );
});

test("Chart is a workspace route that retains project scope and source opening", () => {
  const route = readRoute(
    new URLSearchParams({
      view: "chart",
      project,
      resource: card,
      type: "card",
    }),
    today,
  );
  assert.equal(route.view, "chart");
  assert.deepEqual(readRoute(writeRoute(route), today), route);
});

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

test("view create actions select cards or updates", () => {
  for (const view of [
    "focus",
    "board",
    "calendar",
    "gantt",
    "projects",
    "list",
  ])
    assert.equal(primaryResource(view), "card");
  assert.equal(primaryResource("updates"), "update");
});

test("Focus folder and resource links survive reload independently of the previous project", () => {
  const route = readRoute(
    new URLSearchParams({
      view: "focus",
      project,
      folder: "Work & Home",
      resource: card,
      type: "card",
    }),
    today,
  );
  const saved = writeRoute(route);
  assert.equal(saved.get("project"), project);
  const restored = readRoute(saved, today);
  assert.equal(restored.folder, "Work & Home");
  assert.equal(restored.resource.project, project);
  assert.equal(restored.project, project);
  route.view = "list";
  assert.equal(writeRoute(route).has("folder"), false);
  assert.equal(writeRoute(route).get("project"), project);
});
