import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../../apps/web/src/lib/api/api.ts";
import { cursorPage } from "../../apps/web/src/lib/api/pagination.ts";

test("both server stale-page codes restart once, while unrelated failures retain their meaning", async () => {
  for (const code of ["CURSOR_STALE", "PAGE_STALE"]) {
    const calls = [];
    const result = await cursorPage(async (cursor) => {
      calls.push(cursor);
      if (cursor) throw new api.ApiError(409, { error: { code } });
      return "current page";
    }, "stale");
    assert.deepEqual(calls, ["stale", null]);
    assert.equal(result.reset, true);
  }
  for (const [status, code] of [
    [401, "SESSION_REQUIRED"],
    [409, "VERSION_CONFLICT"],
    [503, "SERVER_BUSY"],
  ]) {
    let calls = 0;
    await assert.rejects(
      cursorPage(async () => {
        calls++;
        throw new api.ApiError(status, { error: { code } });
      }, "old"),
      { status },
    );
    assert.equal(calls, 1);
  }
});

test("pending commands own an immutable payload and status always uses their original epoch", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  api.configure({
    csrf_token: "first",
    command_epoch: "original-epoch",
    server_time: new Date().toISOString(),
  });
  const payload = { set: { labels: ["original"] } };
  const pending = api.command(
    "/api/v1/projects/test/cards",
    "PATCH",
    payload,
    "version",
  );
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    if (calls.length === 1) throw new TypeError("Response lost");
    return {
      status: 200,
      ok: true,
      json: async () => ({
        api_version: "1",
        request_id: pending.requestId,
        replayed: false,
        status: "committed",
        result: { type: "card" },
        warnings: [],
      }),
    };
  };
  try {
    await assert.rejects(api.send(pending));
    payload.set.labels.push("later caller edit");
    api.configure({
      csrf_token: "second",
      command_epoch: "replacement-epoch",
      server_time: new Date().toISOString(),
    });
    await api.send(pending);
    assert.equal(calls[0].init.body, calls[1].init.body);
    assert.throws(
      () => pending.payload.set.labels.push("accidental pending edit"),
      TypeError,
    );
    await api.commandStatus(pending);
    assert.equal(
      new URL(calls[2].path, "https://local.test").searchParams.get("epoch"),
      "original-epoch",
    );
    assert.equal(calls[1].init.headers["X-Command-Epoch"], "original-epoch");
    assert.equal(
      calls[1].init.headers["X-Request-ID"],
      calls[0].init.headers["X-Request-ID"],
    );
    assert.equal(calls[1].init.headers["If-Match"], '"version"');
  } finally {
    api.clearReads();
    globalThis.fetch = previous;
  }
});

test("commands retain their original user for retry and status after another bootstrap", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  const owner = "12345678-1234-4234-8234-123456789001";
  const another = "12345678-1234-4234-8234-123456789002";
  api.configure({
    csrf_token: "session",
    command_epoch: "owner-epoch",
    server_time: new Date().toISOString(),
    user: { id: owner, name: "Owner", is_default: true },
  });
  const pending = api.command("/api/v1/workspace/preferences", "PATCH", {
    locale: "en",
  });
  api.configure({
    csrf_token: "session",
    command_epoch: "another-epoch",
    server_time: new Date().toISOString(),
    user: { id: another, name: "Another", is_default: false },
  });
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return Response.json({
      api_version: "1",
      request_id: pending.requestId,
      replayed: false,
      status: "committed",
      result: { type: "preferences" },
      warnings: [],
    });
  };
  try {
    await api.send(pending);
    await api.commandStatus(pending);
    assert.equal(pending.userId, owner);
    assert.equal(calls[0].init.headers["X-Astra-User"], owner);
    assert.equal(calls[1].init.headers["X-Astra-User"], owner);
    assert.equal(calls[0].init.headers["X-Command-Epoch"], "owner-epoch");
    const create = api.command(
      "/api/v1/users",
      "POST",
      { id: another, name: "Another" },
      undefined,
      {
        userId: owner,
        epoch: "owner-epoch",
      },
    );
    assert.equal(create.userId, owner);
    assert.equal(create.epoch, "owner-epoch");
  } finally {
    api.clearReads();
    globalThis.fetch = previous;
  }
});
