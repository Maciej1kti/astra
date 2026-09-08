import test from "node:test";
import assert from "node:assert/strict";
import { partitionEdges } from "../../apps/web/src/lib/gantt-projection.ts";
import { detailSummary } from "../../apps/web/src/lib/resource-summary.ts";

test("Gantt partition retains edge order and identifies hidden or undated predecessors", () => {
  const edges = [
    { from: "outside", to: "a", warning: "outside", outside_page: true },
    { from: "a", to: "b", warning: null, outside_page: false },
    { from: "undated", to: "b", warning: null, outside_page: false },
    { from: "b", to: "a", warning: null, outside_page: false },
  ];
  assert.deepEqual(partitionEdges(edges, ["a", "b"]), {
    links: [
      { id: "a:b", source: "a", target: "b", type: "e2s" },
      { id: "b:a", source: "b", target: "a", type: "e2s" },
    ],
    hiddenEdges: [edges[0], edges[2]],
  });
  assert.deepEqual(partitionEdges(edges, []).hiddenEdges, edges);
});

test("Focus detail fallback has the same source-derived badges as an indexed card summary", () => {
  const resource = { metadata: {
    id: "card", title: "Outcome", status: "active", priority: "high", kind: "outcome",
    owner: "Owner", labels: ["Review, exact"], archived: false,
    acceptance: [{ id: "a", text: "One", completed: true }, { id: "b", text: "Two", completed: false }],
    expected_result: "Private details", "x-secret": "Not summary data",
  }, body: "Never in the summary", version: "r1-version" };
  assert.deepEqual(detailSummary(resource, "project", "card"), {
    id: "card", project_id: "project", type: "card", title: "Outcome", version: "r1-version",
    availability: "ready", status: "active", priority: "high", kind: "outcome",
    owner: "Owner", labels: ["Review, exact"], archived: false,
    acceptance_progress: { total: 2, completed: 1 },
  });
  assert.equal(resource.metadata.acceptance.length, 2);
});

test("detail summaries map project/update names and preserve read receipt state", () => {
  assert.equal(detailSummary({ metadata: { id: "p", name: "Project", state: "paused" }, version: "v", body: "" }, "p", "project").status, "paused");
  const update = detailSummary({ metadata: { id: "u", summary: "Result", kind: "result", target: { type: "card", id: "c" } }, version: "v", body: "", read: false }, "p", "update");
  assert.equal(update.title, "Result");
  assert.deepEqual(update.target, { type: "card", id: "c" });
  assert.equal(update.read, false);
});
