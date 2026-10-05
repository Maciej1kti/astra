import test from "node:test";
import assert from "node:assert/strict";
import {
  streamRecovery,
  streamRetryDelay,
} from "../../apps/web/src/features/session/event-stream.ts";

class SessionEnded extends Error {}

function fixture(outcomes = []) {
  const timers = [];
  const log = { probes: 0, reconnects: 0 };
  const recovery = streamRecovery({
    probe: async () => {
      log.probes++;
      const outcome = outcomes.shift();
      if (outcome) throw outcome;
    },
    ended: (cause) => cause instanceof SessionEnded,
    reconnect: () => log.reconnects++,
    schedule: (run, delay) => {
      const timer = { run, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      timer.cancelled = true;
    },
  });
  const settle = () => new Promise((done) => setImmediate(done));
  const fire = async () => {
    const timer = timers.shift();
    assert(timer && !timer.cancelled, "Expected one scheduled retry");
    timer.run();
    await settle();
    return timer.delay;
  };
  return { recovery, timers, log, settle, fire };
}

test("a refused stream is replaced after the session is confirmed, with bounded backoff", async () => {
  const { recovery, timers, log, settle, fire } = fixture();
  const delays = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    recovery.failed(true);
    await settle();
    assert.equal(log.probes, attempt + 1);
    assert.equal(log.reconnects, attempt, "Reconnect waits for its delay");
    delays.push(await fire());
    assert.equal(log.reconnects, attempt + 1);
    assert.equal(timers.length, 0);
  }
  assert.deepEqual(
    delays,
    [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000],
  );
  recovery.opened();
  recovery.failed(true);
  await settle();
  assert.equal(await fire(), 1000, "An opened stream resets the backoff");
  assert.equal(streamRetryDelay(40), 30000);
});

test("a dropped connection keeps its source and only confirms the session", async () => {
  const { recovery, timers, log, settle } = fixture();
  recovery.failed(false);
  await settle();
  assert.deepEqual(log, { probes: 1, reconnects: 0 });
  assert.equal(timers.length, 0, "The browser retries this stream itself");
});

test("an ended session is never reconnected", async () => {
  const { recovery, timers, log, settle } = fixture([new SessionEnded()]);
  recovery.failed(true);
  await settle();
  assert.deepEqual(log, { probes: 1, reconnects: 0 });
  assert.equal(timers.length, 0);
});

test("an unreachable host is probed again before any stream is opened", async () => {
  const { recovery, log, settle, fire } = fixture([
    new TypeError("offline"),
    new TypeError("offline"),
  ]);
  recovery.failed(true);
  await settle();
  assert.deepEqual(log, { probes: 1, reconnects: 0 });
  assert.equal(await fire(), 1000);
  assert.deepEqual(log, { probes: 2, reconnects: 0 });
  assert.equal(await fire(), 2000);
  // The wait has already happened, so a confirmed session reconnects at once.
  assert.deepEqual(log, { probes: 3, reconnects: 1 });
});

test("cancellation drops the scheduled retry and ignores a late confirmation", async () => {
  const waiting = fixture();
  waiting.recovery.failed(true);
  await waiting.settle();
  waiting.recovery.cancel();
  assert.equal(waiting.timers[0].cancelled, true);
  waiting.timers[0].run();
  assert.equal(waiting.log.reconnects, 0);

  const probing = fixture();
  probing.recovery.failed(true);
  probing.recovery.cancel();
  await probing.settle();
  assert.equal(probing.timers.length, 0);
  assert.equal(probing.log.reconnects, 0);

  // A newer failure supersedes the retry scheduled for an earlier one.
  const repeated = fixture();
  repeated.recovery.failed(true);
  await repeated.settle();
  repeated.recovery.failed(true);
  await repeated.settle();
  assert.equal(repeated.timers[0].cancelled, true);
  assert.equal(repeated.timers.filter((timer) => !timer.cancelled).length, 1);
});
