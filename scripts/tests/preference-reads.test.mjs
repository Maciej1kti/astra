import test from "node:test";
import assert from "node:assert/strict";
import { preferenceReads } from "../../apps/web/src/features/session/preference-reads.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function session() {
  const state = { generation: 0, active: true, pending: [], applied: [] };
  const reads = preferenceReads({
    generation: () => state.generation,
    active: () => state.active,
    read: () => {
      const request = deferred();
      state.pending.push(request);
      return request.promise;
    },
    apply: (value) => state.applied.push(value),
  });
  return { state, reads };
}

test("the newest read is applied; an older reply is returned but never overwrites it", async () => {
  const { state, reads } = session();
  const first = reads.settle();
  const second = reads.settle();
  state.pending[1].resolve("newer");
  assert.equal(await second, "newer");
  state.pending[0].resolve("older");
  assert.equal(await first, "older");
  assert.deepEqual(state.applied, ["newer"]);
});

test("a read started beside bootstrap is settled later with its own identity", async () => {
  const { state, reads } = session();
  const early = reads.start();
  assert.equal(early.request, 1);
  assert.equal(early.generation, 0);
  state.pending[0].resolve("initial");
  assert.equal(await reads.settle(early), "initial");
  assert.deepEqual(state.applied, ["initial"]);
  // The outcome stays available to a caller that inspects it directly.
  assert.deepEqual(await early.response, { value: "initial" });
});

test("a reply for an ended or replaced session is dropped, even a failure", async () => {
  const ended = session();
  const stale = ended.reads.settle();
  ended.state.generation++;
  ended.state.pending[0].resolve("previous session");
  assert.equal(await stale, undefined);

  const failed = session();
  const lost = failed.reads.settle();
  failed.state.generation++;
  failed.state.pending[0].reject(new Error("401"));
  assert.equal(await lost, undefined);

  const inactive = session();
  const signedOut = inactive.reads.settle();
  inactive.state.active = false;
  inactive.state.pending[0].resolve("after sign-out");
  assert.equal(await signedOut, undefined);
  assert.deepEqual(
    [ended, failed, inactive].flatMap(({ state }) => state.applied),
    [],
  );
});

test("a failure of the current session reaches its caller, and only its caller", async () => {
  const { state, reads } = session();
  const failing = reads.settle();
  const cause = new Error("unavailable");
  state.pending[0].reject(cause);
  await assert.rejects(failing, (error) => error === cause);
  assert.deepEqual(state.applied, []);
  // A later read is unaffected by the earlier failure.
  const next = reads.settle();
  state.pending[1].resolve("recovered");
  assert.equal(await next, "recovered");
  assert.deepEqual(state.applied, ["recovered"]);
});

test("an unobserved failed read never becomes an unhandled rejection", async () => {
  const unhandled = [];
  const record = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", record);
  try {
    const { state, reads } = session();
    reads.start();
    state.pending[0].reject(new Error("bootstrap failed first"));
    await new Promise((done) => setImmediate(done));
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", record);
  }
});
