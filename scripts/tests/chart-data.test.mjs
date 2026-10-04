import test from "node:test";
import assert from "node:assert/strict";
import { ChartData } from "../../apps/web/src/features/charts/chart-data.ts";
import { ApiError } from "../../apps/web/src/lib/api/api.ts";

const query = {
  project: "p",
  from: "2026-09-01",
  to: "2026-09-30",
  includeArchived: false,
};
const page = (ids, cursor = null) => ({
  items: ids.map((id) => ({ id })),
  page: { next_cursor: cursor, freshness: "ready" },
  warnings: [],
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};

test("Chart replaces obsolete scope results and aborts their transport", async () => {
  const first = deferred();
  let oldSignal;
  const owner = new ChartData(
    () => {},
    async (scope, cursor, options) => {
      if (scope.project === "p") {
        oldSignal = options.signal;
        return first.promise;
      }
      return page(["new"]);
    },
  );
  const old = owner.refresh(query);
  await owner.refresh({ ...query, project: "other" });
  assert.equal(oldSignal.aborted, true);
  first.resolve(page(["old"]));
  await old;
  assert.deepEqual(
    owner.state.series.map((row) => row.id),
    ["new"],
  );
  owner.dispose();
});

test("Chart refreshes again for a source invalidation received during a read", async () => {
  const first = deferred(),
    second = deferred();
  let calls = 0;
  const owner = new ChartData(
    () => {},
    async () => (++calls === 1 ? first.promise : second.promise),
  );
  const job = owner.refresh(query);
  await Promise.resolve();
  void owner.refresh(query);
  first.resolve(page(["old"]));
  await job;
  assert.equal(calls, 2);
  second.resolve(page(["updated"]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    owner.state.series.map((row) => row.id),
    ["updated"],
  );
  owner.dispose();
});

test("Chart never appends a page from an expired snapshot", async () => {
  const calls = [];
  const owner = new ChartData(
    () => {},
    async (scope, cursor) => {
      calls.push(cursor);
      if (cursor) throw new ApiError(409, { error: { code: "PAGE_STALE" } });
      return calls.length === 1 ? page(["old"], "cursor") : page(["fresh"]);
    },
  );
  await owner.refresh(query);
  await owner.more();
  assert.deepEqual(calls, [null, "cursor", null]);
  assert.deepEqual(
    owner.state.series.map((row) => row.id),
    ["fresh"],
  );
  assert.match(owner.state.notice, /first page/);
  owner.dispose();
});

test("Chart appends compatible pages and preserves results on a failed read", async () => {
  let calls = 0;
  const owner = new ChartData(
    () => {},
    async () => {
      calls++;
      if (calls === 3) throw new Error("Unavailable");
      return calls === 1 ? page(["a"], "cursor") : page(["b"]);
    },
  );
  await owner.refresh(query);
  await owner.more();
  assert.deepEqual(
    owner.state.series.map((row) => row.id),
    ["a", "b"],
  );
  await owner.refresh(query);
  assert.equal(owner.state.error, "Unavailable");
  assert.deepEqual(
    owner.state.series.map((row) => row.id),
    ["a", "b"],
  );
  owner.dispose();
});

test("Chart refresh keeps loaded later pages and stops catalog growth at its explicit bound", async () => {
  const calls = [];
  let revision = 1;
  const owner = new ChartData(
    () => {},
    async (scope, cursor) => {
      const index = cursor ? Number(cursor) : 0;
      calls.push([revision, index]);
      return page(
        Array.from({ length: 100 }, (_, i) => `${revision}:${index * 100 + i}`),
        String(index + 1),
      );
    },
  );
  await owner.refresh(query);
  await owner.more();
  revision = 2;
  await owner.refresh(query);
  assert.equal(owner.state.series.length, 200);
  assert.equal(owner.state.series.at(-1).id, "2:199");
  assert.deepEqual(calls.slice(-2), [
    [2, 0],
    [2, 1],
  ]);
  for (let i = 0; i < 5; i++) await owner.more();
  assert.equal(owner.state.series.length, 500);
  assert.equal(owner.state.cursor, null);
  assert.match(owner.state.notice, /500 counters/);
  owner.dispose();
});
