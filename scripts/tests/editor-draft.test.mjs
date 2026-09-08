import test from "node:test";
import assert from "node:assert/strict";
import {
  createEditorDraft,
  draftSnapshot,
  editorPayload,
} from "../../apps/web/src/features/editor/editor-draft.ts";
import {
  editTarget,
  createTarget,
} from "../../apps/web/src/features/editor/editor-target.ts";

function card(metadata = {}) {
  return {
    type: "card",
    body: "Draft body",
    version: "original",
    metadata: {
      id: "card",
      title: "Edited card",
      status: "active",
      kind: "outcome",
      priority: "normal",
      position: "position",
      archived: false,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      labels: [" preserved tag "],
      depends_on: ["existing-dependency"],
      ...metadata,
    },
  };
}
test("an unrelated card edit preserves exact tags, extensions and dependency intent", () => {
  const source = card({ "x-custom": { retained: true } });
  const draft = createEditorDraft(editTarget("p", source));
  const payload = editorPayload(draft);
  assert.deepEqual(payload.set.labels, [" preserved tag "]);
  assert.equal("depends_on" in payload.set, false);
  assert.equal("x-custom" in payload.set, false);
  assert.equal("clear" in payload, false);
  assert.deepEqual(source.metadata["x-custom"], { retained: true });
});
test("clearing optional fields is explicit and never clears unrelated extensions", () => {
  const draft = createEditorDraft(
    editTarget(
      "p",
      card({
        expected_result: "Result",
        owner: "Owner",
        acceptance: [{ id: "a", text: "Done", completed: true }],
        milestone_id: "m",
        blocked: { reason: "Review" },
        schedule: { start: "2026-09-01", end: "2026-09-02" },
        due: { date: "2026-09-03", kind: "hard" },
        review_on: "2026-09-04",
      }),
    ),
  );
  Object.assign(draft.fields, {
    expectedResult: "",
    owner: "",
    acceptance: [],
    milestoneId: "",
    blockedReason: "",
    start: "",
    end: "",
    due: "",
    review: "",
    dependencies: [],
  });
  draft.common.advanced = '{"x-user":{"enabled":true}}';
  const payload = editorPayload(draft);
  const optional = [
    "expected_result",
    "owner",
    "acceptance",
    "milestone_id",
    "blocked",
    "schedule",
    "due",
    "review_on",
  ];
  assert.deepEqual(payload.clear, optional);
  assert.deepEqual(payload.set["x-user"], { enabled: true });
  assert.deepEqual(payload.set.depends_on, []);
  for (const field of optional) assert.equal(field in payload.set, false);
});
test("each resource draft emits only its own fields", () => {
  const cardDraft = createEditorDraft(
    createTarget("p", "card", {
      title: "New",
      schedule: { start: "2026-09-01", end: "2026-09-02" },
    }),
  );
  const created = editorPayload(cardDraft);
  assert.deepEqual(created.schedule, {
    start: "2026-09-01",
    end: "2026-09-02",
  });
  assert.equal("set" in created, false);
  const reportDraft = createEditorDraft({
    project: "p",
    type: "update",
    resource: null,
    initialMetadata: {
      summary: "Resolved",
      kind: "resolution",
      resolves: ["a", "b"],
    },
  });
  const report = editorPayload(reportDraft);
  assert.deepEqual(report.target, { type: "project", id: "p" });
  assert.deepEqual(report.resolves, ["a", "b"]);
  assert.equal("labels" in report, false);
  const milestone = editorPayload(
    createEditorDraft(createTarget("p", "milestone")),
  );
  assert.equal(milestone.status, "planned");
  assert.equal("priority" in milestone, false);
  const project = createEditorDraft(
    editTarget("p", {
      type: "project",
      version: "v",
      body: "",
      metadata: {
        id: "p",
        name: "Project",
        state: "paused",
        phase: "Discovery",
        review_on: "2026-09-02",
      },
    }),
  );
  project.fields.phase = "";
  project.fields.review = "";
  assert.deepEqual(editorPayload(project).clear, ["phase", "review_on"]);
  cardDraft.fields.end = "";
  assert.throws(() => editorPayload(cardDraft), /both start and end/);
  cardDraft.common.advanced = "[]";
  assert.throws(() => editorPayload(cardDraft), /JSON object/);
});
test("drafts own nested edits and include unfinished tag and acceptance input", () => {
  const source = card({
    acceptance: [{ id: "a", text: "Original", completed: false }],
  });
  const draft = createEditorDraft(editTarget("p", source));
  const before = draftSnapshot(draft);
  draft.fields.tagDraft = "unsubmitted tag";
  draft.fields.acceptanceDraft = "unsubmitted criterion";
  draft.fields.acceptance[0].text = "Edited";
  draft.fields.dependencies.push("new");
  draft.fields.labels.push("new");
  assert.notEqual(draftSnapshot(draft), before);
  assert.equal(JSON.parse(draftSnapshot(draft)).tagDraft, "unsubmitted tag");
  assert.equal(source.metadata.acceptance[0].text, "Original");
  assert.deepEqual(source.metadata.depends_on, ["existing-dependency"]);
  assert.deepEqual(source.metadata.labels, [" preserved tag "]);
});
