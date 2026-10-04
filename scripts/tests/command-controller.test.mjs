import test from "node:test";
import assert from "node:assert/strict";
import { CommandController } from "../../apps/web/src/lib/api/command-controller.ts";
import {
  ApiError,
  normalizeCommandReply,
} from "../../apps/web/src/lib/api/api.ts";

const pending = Object.freeze({
  path: "/api/v1/projects/test/cards",
  method: "PATCH",
  payload: { set: { title: "Draft" } },
  requestId: "0199a000-0000-7000-8000-000000000001",
  epoch: "original-epoch",
  version: "original-version",
});
const committed = {
  kind: "committed",
  reply: {
    api_version: "1",
    request_id: pending.requestId,
    status: "committed",
    result: { type: "card" },
    warnings: [],
    replayed: false,
  },
};

test("lost replies retain identity and concurrent submissions cannot replace a command", async () => {
  let release;
  const seen = [];
  const operation = new CommandController({
    send: async (value) => {
      seen.push(value);
      if (seen.length === 1)
        return new Promise((_, reject) => {
          release = reject;
        });
      return committed;
    },
  });
  operation.prepare(pending);
  const first = operation.retry();
  assert.equal(operation.busy, true);
  assert.throws(
    () => operation.prepare({ ...pending, requestId: "replacement" }),
    /oczekujące/,
  );
  await assert.rejects(operation.retry(), /już/);
  release(new TypeError("Response lost"));
  await assert.rejects(first, /Response lost/);
  assert.equal(operation.state.phase, "uncertain");
  assert.equal(operation.pending, pending);
  assert.deepEqual(await operation.retry(), committed);
  assert.equal(seen[0], seen[1]);
  assert.equal(operation.pending, null);
});

test("session access is independent of an uncertain command and restored access reuses its identity", async () => {
  let allowed = true;
  let calls = 0;
  const operation = new CommandController({
    allowed: () => allowed,
    send: async () => {
      calls++;
      throw new ApiError(401, {});
    },
  });
  operation.prepare(pending);
  await assert.rejects(operation.retry(), { status: 401 });
  allowed = false;
  await assert.rejects(operation.retry(), /Połącz się ponownie/);
  assert.equal(calls, 1);
  assert.equal(operation.pending, pending);
  allowed = true;
  await assert.rejects(operation.retry(), { status: 401 });
  assert.equal(calls, 2);
});

test("definitive rejection releases the command; status rejection preserves its error code", async () => {
  const operation = new CommandController({
    send: async () => {
      throw new ApiError(412, { error: { code: "VERSION_CONFLICT" } });
    },
  });
  operation.prepare(pending);
  await assert.rejects(operation.retry(), { status: 412 });
  assert.equal(operation.state.phase, "rejected");
  assert.equal(operation.pending, null);
  const checked = new CommandController({
    status: async () => ({
      api_version: "1",
      request_id: pending.requestId,
      state: "rejected",
      error: {
        api_version: "1",
        error: { code: "VERSION_CONFLICT", message: "Conflict" },
      },
    }),
  });
  checked.prepare(pending);
  await assert.rejects(checked.check(), { status: 412 });
  assert.equal(checked.pending, null);
});

test("blocked and needs-review responses remain unresolved, while accepted jobs retain identity", async () => {
  for (const [state, label] of [
    ["prepared", "Przygotowane"],
    ["blocked", "Zablokowane"],
    ["needs_review", "Wymaga sprawdzenia"],
  ]) {
    const operation = new CommandController({
      send: async () => ({ kind: "unresolved", state }),
    });
    operation.prepare(pending);
    await assert.rejects(operation.retry(), new RegExp(label));
    assert.equal(operation.pending, pending);
  }
  const operation = new CommandController({
    send: async () => ({ kind: "accepted", jobId: "job" }),
  });
  operation.prepare(pending);
  assert.deepEqual(await operation.retry(), { kind: "accepted", jobId: "job" });
  assert.equal(operation.state.phase, "accepted");
  assert.equal(operation.pending, pending);
  operation.finishJob();
  assert.equal(operation.pending, null);
});

test("status confirmation completes only with a committed result; malformed replies are uncertain", async () => {
  const operation = new CommandController({
    status: async () => ({
      api_version: "1",
      request_id: pending.requestId,
      state: "committed",
      result: committed.reply,
    }),
  });
  operation.prepare(pending);
  assert.equal((await operation.check()).kind, "committed");
  assert.equal(operation.pending, null);
  for (const value of [
    {},
    null,
    { status: "committed" },
    { state: "committed" },
    { status: "running" },
  ]) {
    assert.throws(
      () => normalizeCommandReply(value),
      /Nieprawidłowa odpowiedź polecenia/,
    );
  }
  assert.deepEqual(
    normalizeCommandReply({ status: "running", job_id: "job" }),
    { kind: "accepted", jobId: "job" },
  );
});
