import test from "node:test";
import assert from "node:assert/strict";
import {
  ReadRequests,
  ReadQueueFullError,
  mapReads,
} from "../../apps/web/src/lib/api/read-requests.ts";
const turn = () => new Promise((resolve) => setImmediate(resolve));

test("an opted-in available slot starts transport before subsequent synchronous work", async () => {
  const pool = new ReadRequests();
  let started = false;
  let finish;
  const read = pool.run(
    "current",
    () => {
      started = true;
      return new Promise((resolve) => (finish = resolve));
    },
    undefined,
    true,
  );
  const startedImmediately = started;
  await turn();
  finish("current source");
  assert.equal(await read, "current source");
  assert.equal(startedImmediately, true);
});

test("a reentrant subscriber receives the shared response, not a placeholder", async () => {
  const pool = new ReadRequests();
  let nested;
  let calls = 0;
  const read = pool.run(
    "same",
    async () => {
      calls++;
      nested = pool.run("same", async () => {
        throw new Error("Duplicate transport");
      });
      return "observed version";
    },
    undefined,
    true,
  );
  assert.equal(await read, "observed version");
  assert.equal(await nested, "observed version");
  assert.equal(calls, 1);
});

test("a synchronous transport failure releases its slot for queued and later reads", async () => {
  const pool = new ReadRequests({ concurrency: 1 });
  const failed = pool.run(
    "failed",
    () => {
      throw new Error("Transport failed");
    },
    undefined,
    true,
  );
  const next = pool.run("next", async () => "fresh source");
  await assert.rejects(failed, /Transport failed/);
  assert.equal(await next, "fresh source");
  assert.equal(
    await pool.run("later", async () => "later source"),
    "later source",
  );
});

test("subscriber cancellation during synchronous transport startup cannot publish its result", async () => {
  const pool = new ReadRequests();
  const subscriber = new AbortController();
  let transportSignal;
  const read = pool.run(
    "cancelled",
    async (signal) => {
      transportSignal = signal;
      subscriber.abort();
      return "obsolete source";
    },
    subscriber.signal,
    true,
  );
  await assert.rejects(read, { name: "AbortError" });
  assert.equal(transportSignal.aborted, true);
  assert.equal(
    await pool.run("cancelled", async () => "new source"),
    "new source",
  );
});

test("cancelling a reentrant subscriber retains the original reader's transport", async () => {
  const pool = new ReadRequests();
  const subscriber = new AbortController();
  let rejected;
  let transportSignal;
  const read = pool.run(
    "same",
    async (signal) => {
      transportSignal = signal;
      const nested = pool.run(
        "same",
        async () => "duplicate",
        subscriber.signal,
      );
      rejected = assert.rejects(nested, { name: "AbortError" });
      subscriber.abort();
      return "shared source";
    },
    undefined,
    true,
  );
  assert.equal(await read, "shared source");
  await rejected;
  assert.equal(transportSignal.aborted, false);
});

test("concurrent readers share a GET while cancellation belongs to the subscriber", async () => {
  const pool = new ReadRequests();
  let calls = 0,
    resolveRead,
    transportSignal;
  const operation = (signal) => {
    calls++;
    transportSignal = signal;
    return new Promise((resolve) => {
      resolveRead = resolve;
    });
  };
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

test("default reads retain their cancellation window before transport starts", async () => {
  const pool = new ReadRequests();
  const subscriber = new AbortController();
  let calls = 0;
  const read = pool.run("obsolete", async () => ++calls, subscriber.signal);
  assert.equal(calls, 0);
  subscriber.abort();
  await assert.rejects(read, { name: "AbortError" });
  await turn();
  assert.equal(calls, 0);
  assert.equal(await pool.run("obsolete", async () => "current"), "current");
});

test("cancelled queued work never reaches the network or prevents a newer read", async () => {
  const pool = new ReadRequests({ concurrency: 1, maxQueued: 1 });
  let unblock,
    oldCalls = 0;
  const first = pool.run(
    "first",
    () =>
      new Promise((resolve) => {
        unblock = resolve;
      }),
  );
  const obsolete = new AbortController();
  const old = pool.run(
    "old",
    async () => {
      oldCalls++;
    },
    obsolete.signal,
  );
  await turn();
  obsolete.abort();
  await assert.rejects(old, { name: "AbortError" });
  const next = pool.run("next", async () => "current");
  await assert.rejects(
    pool.run("overflow", async () => "never"),
    ReadQueueFullError,
  );
  unblock("done");
  await first;
  assert.equal(await next, "current");
  assert.equal(oldCalls, 0);
});

test("session cleanup aborts active reads and prevents queued operations", async () => {
  const pool = new ReadRequests({ concurrency: 1 });
  const active = pool.run(
    "active",
    (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("Ended", "AbortError")),
        ),
      ),
  );
  let queuedCalls = 0;
  const queued = pool.run("queued", async () => queuedCalls++);
  await turn();
  pool.clear();
  await assert.rejects(active, { name: "AbortError" });
  await assert.rejects(queued, { name: "AbortError" });
  assert.equal(queuedCalls, 0);
  assert.equal(
    await pool.run("new session", async () => "restored"),
    "restored",
  );
});

test("known-ID resolution preserves source order and bounds outstanding operations", async () => {
  let active = 0,
    maximum = 0;
  const result = await mapReads(
    Array.from({ length: 100 }, (_, i) => i),
    async (id) => {
      maximum = Math.max(maximum, ++active);
      await turn();
      active--;
      return id * 2;
    },
  );
  assert.equal(maximum, 3);
  assert.deepEqual(
    result,
    Array.from({ length: 100 }, (_, i) => i * 2),
  );
});

test("immediate and queued reads retain the configured concurrency bound", async () => {
  const pool = new ReadRequests({ concurrency: 3, maxQueued: 5 });
  let active = 0;
  let maximum = 0;
  const finish = [];
  const reads = Array.from({ length: 8 }, (_, index) =>
    pool.run(String(index), () => {
      maximum = Math.max(maximum, ++active);
      return new Promise((resolve) => {
        finish.push(() => {
          active--;
          resolve(index);
        });
      });
    }),
  );
  await turn();
  assert.equal(finish.length, 3);
  await assert.rejects(
    pool.run("overflow", async () => "never"),
    ReadQueueFullError,
  );
  while (finish.length) {
    finish.shift()();
    await turn();
  }
  assert.deepEqual(await Promise.all(reads), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(maximum, 3);
  assert.equal(active, 0);
});

test("the read deadline still aborts transport and releases the occupied slot", async () => {
  const pool = new ReadRequests({ concurrency: 1, timeoutMs: 10 });
  const timed = pool.run(
    "timed",
    (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  await assert.rejects(timed, { name: "TimeoutError" });
  assert.equal(await pool.run("next", async () => "current"), "current");
});
