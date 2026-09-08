/** Analysis-only probes of the current implementation, not product regression tests. */
import assert from "node:assert/strict";
import { ApiError, configure, command, send, clearReads } from "../../../apps/web/src/lib/api.ts";
import { cursorPage } from "../../../apps/web/src/lib/pagination.ts";
import { affectedSections, invalidatesTags } from "../../../apps/web/src/lib/view-queries.ts";

const results = {};
for (const code of ["CURSOR_STALE", "PAGE_STALE"]) {
  const calls = [];
  try {
    const result = await cursorPage(async (cursor) => {
      calls.push(cursor);
      if (cursor) throw new ApiError(409, { error: { code } });
      return "first page";
    }, "old cursor");
    results[code] = { calls, reset: result.reset };
  } catch (error) {
    results[code] = { calls, error: error.data.error.code, reset: false };
  }
}
assert.equal(results.CURSOR_STALE.reset, true);
assert.equal(results.PAGE_STALE.reset, false);
const query = { view: "list", project: "A", search: "", collection: "cards", archived: false, status: "", priority: "", label: "" };
const unrelated = { kind: "changed", project_id: "B", target: { type: "card", id: "other" } };
results.unrelatedCardEvent = { activeViewSections: affectedSections(unrelated, query), invalidatesTagSuggestions: invalidatesTags(unrelated) };

// A Pending payload is currently retained by reference. Callers must avoid mutation.
configure({ csrf_token: "synthetic", command_epoch: "synthetic", server_time: new Date().toISOString() });
const originalFetch = globalThis.fetch;
const sentBodies = [];
globalThis.fetch = async (_url, init) => {
  sentBodies.push(init.body);
  if (sentBodies.length === 1) throw new TypeError("Synthetic lost response");
  return { status: 200, ok: true, json: async () => ({ status: "committed" }) };
};
try {
  const payload = { set: { labels: ["original"] } };
  const pending = command("/synthetic", "PATCH", payload, "version");
  await assert.rejects(send(pending));
  payload.set.labels.push("changed after creation");
  await send(pending);
  results.pendingPayloadAliasing = { bodiesEqual: sentBodies[0] === sentBodies[1], requestIdRetained: !!pending.requestId };
  assert.equal(results.pendingPayloadAliasing.bodiesEqual, false);
} finally { clearReads(); globalThis.fetch = originalFetch; }
console.log(JSON.stringify(results, null, 2));
