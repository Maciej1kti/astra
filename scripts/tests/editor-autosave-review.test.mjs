import test from "node:test";
import assert from "node:assert/strict";
import { EditorAutosave } from "../../apps/web/src/features/editor/editor-autosave.ts";
import { ApiError } from "../../apps/web/src/lib/api/api.ts";
import {
  createEditorDraft,
  editorPayload,
  autosaveSnapshot,
} from "../../apps/web/src/features/editor/editor-draft.ts";

function card(version, review) {
  return {
    type: "card",
    version,
    body: "",
    metadata: {
      id: "card-id",
      title: "Title",
      status: "planned",
      priority: "normal",
      archived: false,
      labels: [],
      ...(review ? { review_on: review } : {}),
    },
  };
}
function ack(resource) {
  return {
    kind: "committed",
    reply: { status: "committed", result: { resource }, warnings: [] },
  };
}
function setup(options = {}) {
  let sequence = 0;
  return new EditorAutosave({
    source: card("v0"),
    buildPayload: (_source, draft) => draft,
    createPending: (source, payload) => ({
      path: source ? `/cards/${source.metadata.id}` : "/cards",
      method: source ? "PATCH" : "POST",
      payload: structuredClone(payload),
      requestId: `request-${++sequence}`,
      epoch: "epoch",
      version: source?.version,
    }),
    resourceFromReply: (reply) => reply.result.resource,
    ...options,
  });
}

test("a definitive conflict pauses queued edits and retains the rejected identity", async () => {
  const attempts = [];
  const failure = new ApiError(412, { error: { code: "VERSION_CONFLICT" } });
  const autosave = setup({
    send: async (pending) => {
      attempts.push(pending);
      throw failure;
    },
  });
  await assert.rejects(autosave.enqueue({ title: "First" }, "first"));
  assert.equal(autosave.state.phase, "conflict");
  await autosave.enqueue({ title: "Latest" }, "latest");
  assert.equal(attempts.length, 1);
  assert.equal(autosave.pending, attempts[0]);
  await assert.rejects(autosave.retry());
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1], attempts[0]);
});

test("correcting a definitively rejected validation proposal starts a new conditional command", async () => {
  const attempts = [];
  const autosave = setup({
    send: async (pending) => {
      attempts.push(pending);
      if (attempts.length === 1)
        throw new ApiError(422, { error: { code: "VALIDATION_ERROR" } });
      return ack(card("v1"));
    },
  });
  await assert.rejects(autosave.enqueue({ title: "Rejected" }, "rejected"));
  await autosave.enqueue({ title: "Corrected" }, "corrected");
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0].requestId, attempts[1].requestId);
  assert.equal(attempts[1].version, "v0");
  assert.equal(autosave.state.phase, "saved");
});

test("returning to the active draft cancels a newer queued value without a duplicate write", async () => {
  const attempts = [];
  let release;
  const autosave = setup({
    send: async (pending) => {
      attempts.push(pending);
      if (attempts.length === 1)
        await new Promise((resolve) => {
          release = resolve;
        });
      return ack(card("v1"));
    },
  });
  const first = autosave.enqueue({ title: "Active" }, "active");
  void autosave.enqueue({ title: "Queued" }, "queued");
  void autosave.enqueue({ title: "Active" }, "active");
  release();
  await first;
  assert.equal(attempts.length, 1);
  assert.equal(autosave.hasWork, false);
});

test("a queued clear uses metadata introduced by the preceding acknowledged write", async () => {
  const attempts = [];
  let release;
  const autosave = setup({
    buildPayload: (source, draft) => editorPayload({ ...draft, source }),
    send: async (pending) => {
      attempts.push(pending);
      if (attempts.length === 1) {
        await new Promise((resolve) => {
          release = resolve;
        });
        return ack(card("v1", "2026-09-08"));
      }
      return ack(card("v2"));
    },
  });
  const draft = createEditorDraft({
    project: "project",
    type: "card",
    resource: card("v0"),
  });
  draft.fields.review = "2026-09-08";
  const first = autosave.enqueue(draft, autosaveSnapshot(draft));
  draft.fields.review = "";
  void autosave.enqueue(draft, autosaveSnapshot(draft));
  release();
  await first;
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].version, "v1");
  assert.deepEqual(attempts[1].payload.clear, ["review_on"]);
});

test("session loss between acknowledgements prevents dispatch of the queued write", async () => {
  let allowed = true;
  let release;
  const attempts = [];
  const autosave = setup({
    allowed: () => allowed,
    send: async (pending) => {
      attempts.push(pending);
      if (attempts.length === 1)
        await new Promise((resolve) => {
          release = resolve;
        });
      return ack(card(`v${attempts.length}`));
    },
  });
  const first = autosave.enqueue({ title: "First" }, "first");
  void autosave.enqueue({ title: "Queued" }, "queued");
  allowed = false;
  release();
  await assert.rejects(first);
  assert.equal(attempts.length, 1);
  assert.equal(autosave.hasWork, true);
  allowed = true;
  await autosave.flush();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].version, "v1");
});
