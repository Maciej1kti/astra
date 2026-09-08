import test from "node:test";
import assert from "node:assert/strict";
import { ViewData } from "../../apps/web/src/features/workspace/view-data.ts";

const query = {
  view: "list",
  project: "first",
  search: "",
  collection: "cards",
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
