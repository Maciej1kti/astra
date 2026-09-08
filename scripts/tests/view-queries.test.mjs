import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { viewSections, viewQueryKey, affectedSections, invalidatesTags, resourceListPath, invalidationBatch, loadView } from "../../apps/web/src/lib/view-queries.ts";
import { api, ApiError, configure, clearReads, command, send } from "../../apps/web/src/lib/api.ts";
import { cursorPage, cardActivityPath } from "../../apps/web/src/lib/pagination.ts";
import { TagSuggestions } from "../../apps/web/src/lib/tag-suggestions.ts";

const query = { view: "list", project: "p", search: "", collection: "cards", archived: false, status: "", priority: "", label: "" };
const response = (value) => ({ status: 200, ok: true, json: async () => value });

test("planning routes only load shared project context; list and reports fetch their own collection", () => {
  assert.deepEqual(viewSections({ ...query, view: "calendar" }), ["projects", "planning"]);
  assert.deepEqual(viewSections(query), ["projects", "card"]);
  assert.deepEqual(viewSections({ ...query, view: "updates" }), ["projects", "update"]);
  assert.deepEqual(viewSections({ ...query, view: "list", collection: "milestones" }), ["projects", "milestone"]);
});

test("SSE changes invalidate only affected visible data, with conservative recovery for gaps", () => {
  assert.equal(invalidatesTags({ kind:"changed",target:{type:"card"},tags_changed:false }),false);
  assert.equal(invalidatesTags({ kind:"changed",target:{type:"card"},tags_changed:true }),true);
  assert.equal(invalidatesTags({ kind:"changed",target:{type:"card"} }),true);
  assert.deepEqual(affectedSections({ kind: "changed", project_id: "other", target: { type: "card" } }, query), []);
  assert.deepEqual(affectedSections({ kind: "changed", project_id: "p", target: { type: "update" } }, query), []);
  assert.deepEqual(affectedSections({ kind: "changed", project_id: "p", target: { type: "card" } }, query), ["card"]);
  assert.deepEqual(affectedSections({ kind: "resync_required" }, query), ["projects", "card"]);
  assert.deepEqual(affectedSections({ kind: "changed", project_id: "p", target: { type: "milestone" } }, { ...query, view: "gantt" }), ["planning"]);
});

test("loaded-title filters retain queries and pagination, while server filters remain scoped and exact", () => {
  assert.equal(viewQueryKey({ ...query, view: "board" }), viewQueryKey({ ...query, view: "board", search: "new" }));
  assert.notEqual(viewQueryKey(query), viewQueryKey({ ...query, search: "new" }));
  const url = new URL(resourceListPath({ ...query, label: "Review, exact", archived: true }, "card", "opaque:c"), "https://local.test");
  assert.equal(url.searchParams.get("label"), "Review, exact");
  assert.equal(url.searchParams.get("cursor"), "opaque:c");
  assert.equal(url.searchParams.get("archived"), "true");
});

test("continuous invalidations flush at the deadline and teardown cancels queued work", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const batches = [];
    const batch = invalidationBatch((events) => batches.push(events), 150, 500);
    for (let i = 0; i < 5; i++) { batch.push({ kind: "changed" }); mock.timers.tick(100); }
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 5);
    batch.push({ kind: "changed" });
    batch.cancel();
    mock.timers.tick(500);
    assert.equal(batches.length, 1);
  } finally { mock.timers.reset(); }
});

test("page refresh preserves a valid cursor and restarts only on explicit CURSOR_STALE", async () => {
  const seen = [];
  assert.deepEqual(await cursorPage(async (cursor) => { seen.push(cursor); return "same page"; }, "page-2"), { value: "same page", reset: false });
  const recovered = await cursorPage(async (cursor) => { seen.push(cursor); if (cursor) throw new ApiError(409, { error: { code: "CURSOR_STALE" } }); return "first"; }, "old");
  assert.deepEqual(recovered, { value: "first", reset: true });
  assert.deepEqual(seen, ["page-2", "old", null]);
  await assert.rejects(cursorPage(async () => { throw new ApiError(401, {}); }, "page"), { status: 401 });
  const url = new URL(cardActivityPath("p", "selected-card", "next"), "https://local.test");
  assert.equal(url.searchParams.get("target_id"), "selected-card");
  assert.equal(url.searchParams.get("target_type"), "card");
  assert.equal(url.searchParams.get("limit"), "50");
});

test("one active card-list load makes exactly one request and leaves unrelated arrays absent", async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(url); return response({ items: [{ id: "c" }], page: { next_cursor: null } }); };
  try {
    const result = await loadView(query, ["card"], {}, new AbortController().signal);
    assert.equal(calls.length, 1);
    assert.deepEqual(result.pages.card.value.items, [{ id: "c" }]);
    assert.equal(result.focus, undefined);
    assert.equal(result.projects, undefined);
  } finally { clearReads(); globalThis.fetch = previous; }
});

test("tag suggestions deduplicate in-flight reads, expire, and reject late cache repopulation after session cleanup", async () => {
  let time = 100, calls = 0, finish;
  const catalog = { names: [], complete: true };
  const suggestions = new TagSuggestions(async () => { calls++; return catalog; }, () => time);
  assert.deepEqual(await Promise.all([suggestions.load(), suggestions.load()]), [catalog, catalog]);
  await suggestions.load();
  assert.equal(calls, 1);
  time += 30_001;
  await suggestions.load();
  assert.equal(calls, 2);
  const late = new TagSuggestions(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  const old = late.load(); late.clear(); finish(catalog); await old;
  const fresh = late.load(); finish(catalog); await fresh;
  assert.equal(calls, 4);
});

test("mutations bypass GET sharing and retry retains original identity, epoch and payload", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  configure({ csrf_token: "csrf", command_epoch: "original", server_time: new Date().toISOString() });
  const pending = command("/resource", "PATCH", { set: { title: "Draft" } }, "version");
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); if (calls.length === 1) throw new TypeError("Response lost"); return response({ status: "committed" }); };
  try {
    await assert.rejects(send(pending), /Response lost/);
    assert.equal(calls.length, 1);
    configure({ csrf_token: "new csrf", command_epoch: "new epoch", server_time: new Date().toISOString() });
    await send(pending);
    assert.equal(calls[0].init.body, calls[1].init.body);
    assert.equal(calls[1].init.headers["X-Command-Epoch"], "original");
    assert.equal(calls[0].init.headers["X-Request-ID"], calls[1].init.headers["X-Request-ID"]);
    assert.equal(calls[1].init.headers["If-Match"], '"version"');
  } finally { globalThis.fetch = previous; }
});
