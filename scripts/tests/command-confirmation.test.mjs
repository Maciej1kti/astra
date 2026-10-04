import test from "node:test";
import assert from "node:assert/strict";
import { CommandController } from "../../apps/web/src/lib/api/command-controller.ts";
import { configure } from "../../apps/web/src/lib/api/api.ts";

const pending = Object.freeze({
  path: "/api/v1/workspace/preferences",
  method: "PATCH",
  payload: { locale: "en" },
  version: "r1." + "0".repeat(64),
  requestId: "0199a000-0000-7000-8000-000000000001",
  epoch: "epoch",
});
const committed = {
  api_version: "1",
  request_id: pending.requestId,
  status: "committed",
  result: { type: "preferences" },
  warnings: [],
  replayed: false,
};
configure({
  csrf_token: "test",
  command_epoch: "epoch",
  server_time: new Date().toISOString(),
});

test("malformed direct and status confirmations retain the original command", async () => {
  const invalid = [
    { ...committed, api_version: "999" },
    { ...committed, request_id: "0199a000-0000-7000-8000-000000000002" },
    { ...committed, replayed: undefined },
    { ...committed, result: { type: "card" } },
    { ...committed, warnings: [{}] },
    {
      api_version: "1",
      request_id: pending.requestId,
      status: "running",
      job_id: "bad",
    },
  ];
  const originalFetch = globalThis.fetch;
  try {
    for (const check of [false, true])
      for (const response of invalid) {
        globalThis.fetch = async () =>
          Response.json(
            check
              ? {
                  api_version: "1",
                  request_id: pending.requestId,
                  state: "committed",
                  result: response,
                }
              : response,
          );
        const controller = new CommandController();
        controller.prepare(pending);
        await assert.rejects(
          check ? controller.check() : controller.retry(),
          /Invalid command/,
        );
        assert.equal(controller.state.phase, "uncertain");
        assert.equal(controller.pending, pending);
      }
    for (const response of [
      {
        api_version: "1",
        request_id: "0199a000-0000-7000-8000-000000000002",
        state: "committed",
        result: committed,
      },
      { api_version: "1", request_id: pending.requestId, state: "rejected" },
      {
        api_version: "1",
        request_id: pending.requestId,
        state: "rejected",
        error: {
          api_version: "999",
          error: { code: "VERSION_CONFLICT", message: "Conflict" },
        },
      },
    ]) {
      globalThis.fetch = async () => Response.json(response);
      const controller = new CommandController();
      controller.prepare(pending);
      await assert.rejects(controller.check(), /Invalid command/);
      assert.equal(controller.pending, pending);
    }
    for (const [status, response] of [
      [202, committed],
      [412, { error: { code: "VERSION_CONFLICT" } }],
      [
        412,
        {
          api_version: "1",
          error: {
            code: "VERSION_CONFLICT",
            message: "Conflict",
            request_id: "0199a000-0000-7000-8000-000000000002",
          },
        },
      ],
    ]) {
      globalThis.fetch = async () => Response.json(response, { status });
      const controller = new CommandController();
      controller.prepare(pending);
      await assert.rejects(controller.retry(), /Invalid command/);
      assert.equal(controller.pending, pending);
    }
    globalThis.fetch = async () => Response.json(committed);
    const controller = new CommandController();
    controller.prepare(pending);
    await controller.commit();
    assert.equal(controller.pending, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("user creation confirms only the submitted profile and retains malformed outcomes", async () => {
  const originalFetch = globalThis.fetch;
  const user = {
    id: "12345678-1234-4234-8234-123456789012",
    name: "Alex",
    is_default: false,
  };
  const creation = {
    ...pending,
    path: "/api/v1/users",
    method: "POST",
    payload: { id: user.id, name: user.name },
  };
  const reply = {
    ...committed,
    result: { type: "user", id: user.id, resource: user },
  };
  try {
    for (const result of [
      { type: "user" },
      { ...reply.result, id: "12345678-1234-4234-8234-123456789013" },
      { ...reply.result, resource: { ...user, name: "Different" } },
      { ...reply.result, resource: { ...user, is_default: true } },
    ]) {
      globalThis.fetch = async () => Response.json({ ...reply, result });
      const operation = new CommandController();
      operation.prepare(creation);
      await assert.rejects(operation.commit(), /Invalid command/);
      assert.equal(operation.pending, creation);
    }
    globalThis.fetch = async () => Response.json(reply, { status: 201 });
    const operation = new CommandController();
    operation.prepare(creation);
    await operation.commit();
    assert.equal(operation.pending, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
