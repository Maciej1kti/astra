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
      priority: "normal",
      position: "position",
      archived: false,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      labels: [" preserved tag "],
      ...metadata,
    },
  };
}
test("an unrelated card edit preserves exact tags and omits retired card fields", () => {
  const source = card();
  const draft = createEditorDraft(editTarget("p", source));
  const payload = editorPayload(draft);
  assert.deepEqual(payload.set.labels, [" preserved tag "]);
  for (const field of [
    "due",
    "review_on",
    "milestone_id",
    "blocked",
    "depends_on",
  ])
    assert.equal(field in payload.set, false);
  assert.equal("advanced" in draft.common, false);
  assert.equal("clear" in payload, false);
});
test("clearing optional card fields is explicit", () => {
  const draft = createEditorDraft(
    editTarget(
      "p",
      card({
        acceptance: [{ id: "a", text: "Done", completed: true }],
        schedule: { start: "2026-09-01", end: "2026-09-02" },
      }),
    ),
  );
  Object.assign(draft.fields, {
    acceptance: [],
    start: "",
    end: "",
  });
  const payload = editorPayload(draft);
  const optional = ["acceptance", "schedule"];
  assert.deepEqual(payload.clear, optional);
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
  assert.equal("advanced" in cardDraft.common, false);
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
  reportDraft.common.advanced = '{"x-report":{"enabled":true}}';
  const reportWithExtra = editorPayload(reportDraft);
  assert.deepEqual(reportWithExtra["x-report"], { enabled: true });
  const milestoneDraft = createEditorDraft(createTarget("p", "milestone"));
  milestoneDraft.common.advanced = '{"x-milestone":{"enabled":true}}';
  const milestone = editorPayload(milestoneDraft);
  assert.equal(milestone.status, "planned");
  milestoneDraft.fields.due = "2026-09-30";
  assert.deepEqual(editorPayload(milestoneDraft).due, { date: "2026-09-30" });
  assert.equal("priority" in milestone, false);
  assert.deepEqual(milestone["x-milestone"], { enabled: true });
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
        "x-project": { retained: true },
      },
    }),
  );
  assert.deepEqual(editorPayload(project), {
    set: { body: "", name: "Project", state: "paused" },
  });
  assert.equal("phase" in editorPayload(project).set, false);
  assert.equal("review_on" in editorPayload(project).set, false);
  assert.equal("advanced" in project.common, false);
  cardDraft.fields.end = "";
  assert.throws(() => editorPayload(cardDraft), /both start and end/);
  milestoneDraft.common.advanced = "[]";
  assert.throws(() => editorPayload(milestoneDraft), /JSON object/);
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
  draft.fields.labels.push("new");
  assert.notEqual(draftSnapshot(draft), before);
  assert.equal(JSON.parse(draftSnapshot(draft)).tagDraft, "unsubmitted tag");
  assert.equal(source.metadata.acceptance[0].text, "Original");
  assert.deepEqual(source.metadata.labels, [" preserved tag "]);
});

test("project folders are preserved, changed and explicitly cleared without affecting card tags", () => {
  const source = {
    type: "project",
    version: "v1",
    body: "Description",
    metadata: { id: "p", name: "Project", state: "active", folder: "Work" },
  };
  const draft = createEditorDraft(editTarget("p", source));
  draft.common.title = "Renamed";
  assert.equal(editorPayload(draft).set.folder, "Work");
  draft.fields.folder = "Home";
  assert.equal(editorPayload(draft).set.folder, "Home");
  draft.fields.folder = "";
  assert.deepEqual(editorPayload(draft), {
    set: { body: "Description", name: "Renamed", state: "active" },
    clear: ["folder"],
  });
  assert.equal(
    "folder" in createEditorDraft(editTarget("p", card())).fields,
    false,
  );
});
