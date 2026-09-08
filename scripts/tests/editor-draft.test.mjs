import test from "node:test";
import assert from "node:assert/strict";
import { editorPayload } from "../../apps/web/src/lib/editor-draft.ts";

const draft = {
  title: "Edited card", status: "active", priority: "normal", kind: "outcome",
  start: "", end: "", due: "", dueKind: "target", review: "", body: "Draft body",
  labels: [" preserved tag "], expectedResult: "", owner: "", acceptance: [],
  advanced: "{}", author: "Owner", phase: "", archived: false, milestoneId: "",
  blockedReason: "", dependencies: ["existing-dependency"], targetType: "project",
  targetId: "", resolves: "", supersedes: "",
};

test("an unrelated card edit preserves exact tags, extensions and dependency intent", () => {
  const metadata = { depends_on: ["existing-dependency"], "x-custom": { retained: true } };
  const payload = editorPayload("card", "p", true, metadata, draft);
  assert.deepEqual(payload.set.labels, [" preserved tag "]);
  assert.equal("depends_on" in payload.set, false);
  assert.equal("x-custom" in payload.set, false, "Unedited source extensions stay untouched by the patch");
  assert.equal("clear" in payload, false);
  assert.deepEqual(metadata["x-custom"], { retained: true });
});

test("clearing populated optional fields is explicit and does not clear unknown extensions", () => {
  const optional = ["expected_result", "owner", "acceptance", "milestone_id", "blocked", "schedule", "due", "review_on"];
  const metadata = Object.fromEntries(optional.map((name) => [name, "populated"]));
  metadata.depends_on = ["existing-dependency"];
  const payload = editorPayload("card", "p", true, metadata, { ...draft, dependencies: [], advanced: '{"x-user":{"enabled":true}}' });
  assert.deepEqual(payload.clear, optional);
  assert.deepEqual(payload.set["x-user"], { enabled: true });
  assert.deepEqual(payload.set.depends_on, []);
  for (const field of optional) assert.equal(field in payload.set, false);
});

test("create and report payloads retain their domain-specific fields", () => {
  const created = editorPayload("card", "p", false, undefined, { ...draft, start: "2026-09-01", end: "2026-09-02" });
  assert.deepEqual(created.schedule, { start: "2026-09-01", end: "2026-09-02" });
  assert.deepEqual(created.depends_on, ["existing-dependency"]);
  assert.equal("set" in created, false);
  const report = editorPayload("update", "p", false, undefined, { ...draft, kind: "resolution", resolves: " a, b, " });
  assert.deepEqual(report.target, { type: "project", id: "p" });
  assert.deepEqual(report.resolves, ["a", "b"]);
  assert.equal(report.summary, draft.title);
  assert.equal("labels" in report, false);
  assert.throws(() => editorPayload("card", "p", false, undefined, { ...draft, start: "2026-09-01" }), /both start and end/);
  assert.throws(() => editorPayload("card", "p", false, undefined, { ...draft, advanced: "[]" }), /JSON object/);
});
