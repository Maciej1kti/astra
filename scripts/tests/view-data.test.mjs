import test from "node:test";
import assert from "node:assert/strict";
import { ViewData } from "../../apps/web/src/features/workspace/view-data.ts";

const query = {
  view: "list",
  project: "first",
  search: "",
  archived: false,
  status: "",
  priority: "",
  label: "",
};
const page = (id) => ({
  pages: {
    card: {
      value: { items: [{ id }], page: { next_cursor: "next" } },
      reset: false,
    },
  },
  notices: {},
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("a late response from another route cannot replace the active view", async () => {
  let current = query;
  const old = deferred();
  const owner = new ViewData({
    query: () => current,
    active: () => true,
    error: assert.fail,
    load: async (scope) =>
      scope.project === "first" ? old.promise : page("new"),
  });
  const first = owner.refresh();
  current = { ...query, project: "second" };
  await owner.refresh();
  old.resolve(page("obsolete"));
  await first;
  assert.deepEqual(owner.state.cards, [{ id: "new" }]);
});

test("session reset cancels queued invalidations and ignores responses that arrive afterwards", async () => {
  const old = deferred();
  let calls = 0;
  const owner = new ViewData({
    query: () => query,
    active: () => false,
    error: assert.fail,
    load: async () => {
      calls++;
      return old.promise;
    },
  });
  const first = owner.refresh();
  owner.refresh(["card"]);
  owner.reset();
  old.resolve(page("obsolete"));
  await first;
  assert.equal(calls, 1);
  assert.deepEqual(owner.state.cards, []);
  assert.equal(owner.state.loadedQueryKey, "");
});

test("in-flight invalidations coalesce into one follow-up while preserving loaded rows", async () => {
  const first = deferred();
  const followed = deferred();
  let calls = 0;
  const owner = new ViewData({
    query: () => query,
    active: () => true,
    error: assert.fail,
    load: async () => {
      calls++;
      return calls === 1 ? first.promise : followed.promise;
    },
  });
  const loading = owner.refresh();
  assert.equal(owner.refresh(["card"]), loading);
  assert.equal(owner.refresh(["card"]), loading);
  first.resolve(page("before"));
  await loading;
  assert.equal(calls, 2);
  assert.deepEqual(owner.state.cards, [{ id: "before" }]);
  followed.resolve(page("after"));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(owner.state.cards, [{ id: "after" }]);
});

test("focus references and their observed version move together on refresh", async () => {
  const focusQuery = { ...query, view: "focus" };
  const snapshots = [
    {
      focus: {
        items: [
          { project_id: "first", card_id: "card-a" },
          { project_id: "second", card_id: "card-b" },
        ],
        version: "focus-v1",
      },
      focusCards: [{ id: "card-a" }, { id: "card-b" }],
      pages: {},
      notices: {},
    },
    {
      focus: {
        items: [
          { project_id: "second", card_id: "card-b" },
          { project_id: "first", card_id: "card-a" },
        ],
        version: "focus-v2",
      },
      focusCards: [{ id: "card-b" }, { id: "card-a" }],
      pages: {},
      notices: {},
    },
  ];
  let calls = 0;
  const owner = new ViewData({
    query: () => focusQuery,
    active: () => true,
    error: assert.fail,
    load: async () => snapshots[calls++],
  });

  await owner.refresh();
  assert.deepEqual(owner.state.focus, snapshots[0].focus.items);
  assert.equal(owner.state.focusVersion, "focus-v1");
  assert.deepEqual(owner.state.focusCards, snapshots[0].focusCards);

  await owner.refresh(["focus"]);
  assert.deepEqual(owner.state.focus, snapshots[1].focus.items);
  assert.equal(owner.state.focusVersion, "focus-v2");
  assert.deepEqual(owner.state.focusCards, snapshots[1].focusCards);
});

const projectRows = (scope) => ({
  projects:
    scope.view === "main"
      ? [{ id: "active" }, { id: "archived" }]
      : [{ id: "active" }],
  pages: {},
  notices: {},
});

test("ordinary project caches cannot satisfy Main's archived-inclusive scope", async () => {
  let current = { ...query, view: "projects" };
  const calls = [];
  const owner = new ViewData({
    query: () => current,
    active: () => true,
    error: assert.fail,
    load: async (scope, sections) => {
      calls.push([scope.view, sections]);
      return sections.includes("projects")
        ? projectRows(scope)
        : { pages: {}, notices: {} };
    },
  });
  await owner.refresh();
  current = { ...current, view: "main" };
  await owner.refresh();
  assert.deepEqual(calls.at(-1), ["main", ["projects"]]);
  assert.deepEqual(owner.state.projects, [
    { id: "active" },
    { id: "archived" },
  ]);
});

for (const view of [
  "focus",
  "projects",
  "list",
  "updates",
  "board",
  "calendar",
  "gantt",
  "chart",
]) {
  test(`Main's archived-inclusive cache cannot satisfy ${view}'s ordinary scope`, async () => {
    let current = { ...query, view: "main" };
    const calls = [];
    const owner = new ViewData({
      query: () => current,
      active: () => true,
      error: assert.fail,
      load: async (scope, sections) => {
        calls.push([scope.view, sections]);
        return sections.includes("projects")
          ? projectRows(scope)
          : { pages: {}, notices: {} };
      },
    });
    await owner.refresh();
    current = { ...current, view };
    await owner.refresh();
    assert.equal(calls.at(-1)[1].includes("projects"), true);
    assert.deepEqual(owner.state.projects, [{ id: "active" }]);
  });
}

test("ordinary project caches remain reusable between compatible view routes", async () => {
  let current = { ...query, view: "projects" };
  const calls = [];
  const owner = new ViewData({
    query: () => current,
    active: () => true,
    error: assert.fail,
    load: async (scope, sections) => {
      calls.push(sections);
      return sections.includes("projects")
        ? projectRows(scope)
        : { pages: {}, notices: {} };
    },
  });
  await owner.refresh();
  for (const view of ["focus", "list", "chart"]) {
    current = { ...current, view };
    await owner.refresh();
    assert.equal(calls.at(-1).includes("projects"), false);
    assert.deepEqual(owner.state.projects, [{ id: "active" }]);
  }
});

test("Main project-only invalidations retain the inclusive scope during a queued follow-up", async () => {
  const current = { ...query, view: "main" };
  const first = deferred(),
    followed = deferred();
  const calls = [];
  const owner = new ViewData({
    query: () => current,
    active: () => true,
    error: assert.fail,
    load: async (scope, sections) => {
      calls.push([scope.view, sections]);
      return calls.length === 1 ? first.promise : followed.promise;
    },
  });
  const loading = owner.refresh();
  assert.equal(owner.refresh(["projects"]), loading);
  first.resolve(projectRows(current));
  await loading;
  assert.deepEqual(calls, [
    ["main", ["projects"]],
    ["main", ["projects"]],
  ]);
  followed.resolve({
    ...projectRows(current),
    projects: [{ id: "updated" }, { id: "archived" }],
  });
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(owner.state.projects, [
    { id: "updated" },
    { id: "archived" },
  ]);
});

test("late inclusive reads cannot replace ordinary projects after leaving Main", async () => {
  let current = { ...query, view: "main" };
  const old = deferred();
  const signals = [];
  const owner = new ViewData({
    query: () => current,
    active: () => true,
    error: assert.fail,
    load: async (scope, _sections, _cursors, signal) => {
      signals.push(signal);
      return scope.view === "main" ? old.promise : projectRows(scope);
    },
  });
  const first = owner.refresh();
  current = { ...current, view: "focus" };
  await owner.refresh();
  assert.equal(signals[0].aborted, true);
  old.resolve(projectRows({ ...current, view: "main" }));
  await first;
  assert.deepEqual(owner.state.projects, [{ id: "active" }]);
});
