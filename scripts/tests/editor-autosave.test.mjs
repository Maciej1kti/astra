import test from "node:test";
import assert from "node:assert/strict";
import { EditorAutosave } from "../../apps/web/src/features/editor/editor-autosave.ts";

function resource(version, title = "Saved") {
  return {
    type: "card",
    body: "",
    version,
    metadata: {
      id: "card",
      title,
      status: "active",
      kind: "outcome",
      priority: "normal",
      archived: false,
      labels: [],
    },
  };
}

function committed(version, title) {
  return {
    kind: "committed",
    reply: {
      status: "committed",
      result: {
        type: "card",
        id: "card",
        version,
        resource: resource(version, title),
      },
      warnings: [],
    },
  };
}

function pendingFactory() {
  let sequence = 0;
  return (source, payload) =>
    Object.freeze({
      path: `/cards/${source?.metadata.id ?? "new"}`,
      method: source ? "PATCH" : "POST",
      payload: structuredClone(payload),
      requestId: `request-${++sequence}`,
      epoch: "epoch",
      version: source?.version,
    });
}

test("queued autosave uses the acknowledged version and latest payload", async () => {
  const sent = [];
  let release;
  const autosave = new EditorAutosave({
    source: resource("v0"),
    buildPayload: (_source, draft) => draft,
    createPending: pendingFactory(),
    resourceFromReply: (reply) => reply.result.resource,
    send: async (pending) => {
      sent.push(pending);
      if (sent.length === 1)
        return new Promise((resolve) => {
          release = () => resolve(committed("v1", "First"));
        });
      return committed("v2", "Latest");
    },
  });

  const first = autosave.enqueue({ set: { title: "First" } }, "first");
  autosave.enqueue({ set: { title: "Latest" } }, "latest");
  assert.equal(sent.length, 1);
  release();
  await first;
  assert.equal(sent.length, 2);
  assert.equal(sent[1].version, "v1");
  assert.deepEqual(sent[1].payload, { set: { title: "Latest" } });
  assert.equal(autosave.source.version, "v2");
  assert.equal(autosave.state.phase, "saved");
});

test("uncertain autosave retains the original command until explicit retry", async () => {
  const sent = [];
  let reject;
  let retry = false;
  const autosave = new EditorAutosave({
    source: resource("v0"),
    buildPayload: (_source, draft) => draft,
    createPending: pendingFactory(),
    resourceFromReply: (reply) => reply.result.resource,
    send: async (pending) => {
      sent.push(pending);
      if (!retry)
        return new Promise((_, fail) => {
          reject = fail;
        });
      return committed("v1", "First");
    },
  });

  const first = autosave.enqueue({ set: { title: "First" } }, "first");
  autosave.enqueue({ set: { title: "Latest" } }, "latest");
  reject(new TypeError("response lost"));
  await assert.rejects(first, /response lost/);
  assert.equal(autosave.state.phase, "uncertain");
  assert.equal(autosave.pending, sent[0]);
  assert.equal(sent.length, 1);

  retry = true;
  await autosave.retry();
  assert.equal(sent.length, 3);
  assert.equal(sent[1], sent[0]);
  assert.equal(sent[2].version, "v1");
  assert.deepEqual(sent[2].payload, { set: { title: "Latest" } });
  assert.equal(autosave.source.version, "v1");
  assert.equal(autosave.state.phase, "saved");
});

test("a queued write keeps its own identity when it fails after the first ACK", async () => {
  const sent = [];
  let release;
  let secondAttempt = 0;
  const autosave = new EditorAutosave({
    source: resource("v0"),
    buildPayload: (_source, draft) => draft,
    createPending: pendingFactory(),
    resourceFromReply: (reply) => reply.result.resource,
    send: async (pending) => {
      sent.push(pending);
      if (sent.length === 1)
        return new Promise((resolve) => {
          release = () => resolve(committed("v1", "First"));
        });
      if (++secondAttempt === 1) throw new TypeError("second response lost");
      return committed("v2", "Second");
    },
  });

  const first = autosave.enqueue({ set: { title: "First" } }, "first");
  autosave.enqueue({ set: { title: "Second" } }, "second");
  release();
  await assert.rejects(first, /second response lost/);
  assert.equal(autosave.state.phase, "uncertain");
  assert.equal(autosave.pending, sent[1]);
  await autosave.retry();
  assert.equal(sent.length, 3);
  assert.equal(sent[2], sent[1]);
  assert.equal(autosave.source.version, "v2");
});
