import test from "node:test";
import assert from "node:assert/strict";
import { detailSummary } from "../../apps/web/src/lib/resources/resource-summary.ts";

test("Focus detail fallback has the same source-derived badges as an indexed card summary", () => {
  const resource = {
    metadata: {
      id: "card",
      title: "Outcome",
      status: "active",
      priority: "high",
      labels: ["Review, exact"],
      archived: false,
      acceptance: [
        { id: "a", text: "One", completed: true },
        { id: "b", text: "Two", completed: false },
      ],
      "x-secret": "Not summary data",
    },
    body: "Never in the summary",
    version: "r1-version",
  };
  assert.deepEqual(detailSummary(resource, "project", "card"), {
    id: "card",
    project_id: "project",
    type: "card",
    title: "Outcome",
    version: "r1-version",
    availability: "ready",
    status: "active",
    priority: "high",
    labels: ["Review, exact"],
    archived: false,
    acceptance_progress: { total: 2, completed: 1 },
  });
  assert.equal(resource.metadata.acceptance.length, 2);
});

test("detail summaries map project/update names and preserve read receipt state", () => {
  assert.equal(
    detailSummary(
      {
        type: "project",
        metadata: { id: "p", name: "Project", state: "paused" },
        version: "v",
        body: "",
      },
      "p",
      "project",
    ).status,
    "paused",
  );
  const update = detailSummary(
    {
      type: "update",
      metadata: {
        id: "u",
        summary: "Result",
        kind: "result",
        target: { type: "milestone", id: "m" },
      },
      version: "v",
      body: "",
      read: false,
    },
    "p",
    "update",
  );
  assert.equal(update.title, "Result");
  assert.deepEqual(update.target, { type: "milestone", id: "m" });
  assert.equal(update.read, false);
});
