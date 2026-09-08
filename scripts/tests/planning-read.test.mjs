import test from "node:test";
import assert from "node:assert/strict";
import { PlanningRead } from "../../apps/web/src/features/planning/planning-read.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = () => new Promise((done) => setImmediate(done));

test("a superseded project reply cannot replace the current plan even if abort is ignored", async () => {
  const owner = new PlanningRead(() => {});
  const old = deferred();
  const shown = [];
  let signal;
  const first = owner.run({
    key: "old",
    read: (value) => {
      signal = value;
      return old.promise;
    },
    apply: (value) => shown.push(value),
    failed: assert.fail,
  });
  await owner.run({
    key: "new",
    read: async () => "current",
    apply: (value) => shown.push(value),
    failed: assert.fail,
  });
  assert.equal(signal.aborted, true);
  old.resolve("outdated");
  await first;
  assert.deepEqual(shown, ["current"]);
});

test("a held gesture keeps its baseline and coalesces refreshes until release", async () => {
  const owner = new PlanningRead(() => {});
  const first = deferred();
  const shown = [];
  let reads = 0;
  const request = {
    key: "project",
    read: () => (++reads === 1 ? first.promise : Promise.resolve("fresh")),
    apply: (value) => shown.push(value),
    failed: assert.fail,
  };
  const running = owner.run(request);
  owner.pause(true);
  await owner.run(request);
  await owner.run(request);
  first.resolve("held");
  await running;
  assert.deepEqual(shown, []);
  assert.equal(reads, 1);
  owner.pause(false);
  await settle();
  assert.equal(reads, 2);
  assert.deepEqual(shown, ["fresh"]);
});

test("a scope change during a gesture supersedes an unfinished read before release", async () => {
  const owner = new PlanningRead(() => {});
  const first = deferred();
  const shown = [];
  const running = owner.run({
    key: "old",
    read: () => first.promise,
    apply: (value) => shown.push(value),
    failed: assert.fail,
  });
  owner.pause(true);
  await owner.run({
    key: "new",
    read: async () => "new",
    apply: (value) => shown.push(value),
    failed: assert.fail,
  });
  owner.pause(false);
  first.resolve("old");
  await running;
  await settle();
  assert.deepEqual(shown, ["new"]);
});

test("unmount cancels reads and suppresses late failures and queued refreshes", async () => {
  const owner = new PlanningRead(() => {});
  const first = deferred();
  let reads = 0;
  const request = {
    key: "project",
    read: () => {
      reads++;
      return first.promise;
    },
    apply: assert.fail,
    failed: assert.fail,
  };
  const running = owner.run(request);
  await owner.run(request);
  owner.dispose();
  first.resolve("late");
  await running;
  await owner.run(request);
  assert.equal(reads, 1);
});
