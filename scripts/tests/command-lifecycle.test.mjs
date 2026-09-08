import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../../apps/web/src/lib/api.ts";
import { cursorPage } from "../../apps/web/src/lib/pagination.ts";
import { searchRelations } from "../../apps/web/src/lib/relation-search.ts";

test("relation search filters resource type on the server before its bounded page", async () => {
  const previous = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return { status: 200, ok: true, json: async () => ({ items: [{ id: "self", type: "card" }, { id: "matching", type: "card" }] }) };
  };
  try {
    assert.deepEqual(await searchRelations("project", "card", " shared term ", "self"), [{ id: "matching", type: "card" }]);
    const url = new URL(paths[0], "https://local.test");
    assert.equal(url.pathname, "/api/v1/views/list");
    assert.equal(url.searchParams.get("type"), "card");
    assert.equal(url.searchParams.get("q"), "shared term");
    assert.equal(url.searchParams.get("limit"), "50");
  } finally { api.clearReads(); globalThis.fetch = previous; }
});

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
  for (const [status, code] of [[401, "SESSION_REQUIRED"], [409, "VERSION_CONFLICT"], [503, "SERVER_BUSY"]]) {
    let calls = 0;
    await assert.rejects(cursorPage(async () => { calls++; throw new api.ApiError(status, { error: { code } }); }, "old"), { status });
    assert.equal(calls, 1);
  }
});

test("pending commands own an immutable payload and status always uses their original epoch", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  api.configure({ csrf_token: "first", command_epoch: "original-epoch", server_time: new Date().toISOString() });
  const payload = { set: { labels: ["original"] } };
  const pending = api.command("/resource", "PATCH", payload, "version");
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    if (calls.length === 1) throw new TypeError("Response lost");
    return { status: 200, ok: true, json: async () => ({ state: "committed" }) };
  };
  try {
    await assert.rejects(api.send(pending));
    payload.set.labels.push("later caller edit");
    api.configure({ csrf_token: "second", command_epoch: "replacement-epoch", server_time: new Date().toISOString() });
    await api.send(pending);
    assert.equal(calls[0].init.body, calls[1].init.body);
    assert.throws(() => pending.payload.set.labels.push("accidental pending edit"), TypeError);
    await api.commandStatus(pending);
    assert.equal(new URL(calls[2].path, "https://local.test").searchParams.get("epoch"), "original-epoch");
    assert.equal(calls[1].init.headers["X-Command-Epoch"], "original-epoch");
    assert.equal(calls[1].init.headers["X-Request-ID"], calls[0].init.headers["X-Request-ID"]);
    assert.equal(calls[1].init.headers["If-Match"], '"version"');
  } finally { api.clearReads(); globalThis.fetch = previous; }
});
