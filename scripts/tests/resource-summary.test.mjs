import test from "node:test";
import assert from "node:assert/strict";
import { detailSummary } from "../../apps/web/src/lib/resources/resource-summary.ts";

test("project summaries expose only the supported project metadata", () => {
  const summary = detailSummary(
    {
      type: "project",
      body: "Description",
      version: "v1",
      metadata: {
        id: "project",
        name: "Project",
        state: "active",
        phase: "legacy phase",
        review_on: "2026-09-08",
        "x-legacy": { retained: true },
      },
    },
    "project",
    "project",
  );

  assert.deepEqual(summary, {
    id: "project",
    project_id: "project",
    type: "project",
    title: "Project",
    status: "active",
    version: "v1",
    availability: "ready",
  });
});
