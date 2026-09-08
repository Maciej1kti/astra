import test from "node:test";
import assert from "node:assert/strict";
import { ReadRequests, ReadQueueFullError, mapReads } from "../../apps/web/src/lib/read-requests.ts";
const turn = () => new Promise((resolve) => setImmediate(resolve));

test("concurrent readers share a GET while cancellation belongs to the subscriber", async () => {
  const pool = new ReadRequests();
  let calls = 0, resolveRead, transportSignal;
  const operation = (signal) => { calls++; transportSignal = signal; return new Promise((resolve) => { resolveRead = resolve; }); };
  const first = new AbortController();
  const a = pool.run("same", operation, first.signal);
  const b = pool.run("same", operation);
  await turn();
  first.abort();
  await assert.rejects(a, { name: "AbortError" });
  assert.equal(transportSignal.aborted, false);
  resolveRead("new value");
  assert.equal(await b, "new value");
  assert.equal(calls, 1);
});

test("cancelled queued work never reaches the network or prevents a newer read", async () => {
  const pool = new ReadRequests({ concurrency: 1, maxQueued: 1 });
  let unblock, oldCalls = 0;
  const first = pool.run("first", () => new Promise((resolve) => { unblock = resolve; }));
  const obsolete = new AbortController();
  const old = pool.run("old", async () => { oldCalls++; }, obsolete.signal);
  await turn();
  obsolete.abort();
  await assert.rejects(old, { name: "AbortError" });
  const next = pool.run("next", async () => "current");
  await assert.rejects(pool.run("overflow", async () => "never"), ReadQueueFullError);
  unblock("done");
  await first;
  assert.equal(await next, "current");
  assert.equal(oldCalls, 0);
});

test("session cleanup aborts active reads and prevents queued operations", async () => {
  const pool = new ReadRequests({ concurrency: 1 });
  const active = pool.run("active", (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Ended", "AbortError")))));
  let queuedCalls = 0;
  const queued = pool.run("queued", async () => queuedCalls++);
  await turn();
  pool.clear();
  await assert.rejects(active, { name: "AbortError" });
  await assert.rejects(queued, { name: "AbortError" });
  assert.equal(queuedCalls, 0);
  assert.equal(await pool.run("new session", async () => "restored"), "restored");
});

test("known-ID resolution preserves source order and bounds outstanding operations", async () => {
  let active = 0, maximum = 0;
  const result = await mapReads(Array.from({ length: 100 }, (_, i) => i), async (id) => {
    maximum = Math.max(maximum, ++active);
    await turn();
    active--;
    return id * 2;
  });
  assert.equal(maximum, 3);
  assert.deepEqual(result, Array.from({ length: 100 }, (_, i) => i * 2));
});
