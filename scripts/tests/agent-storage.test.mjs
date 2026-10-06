import test from "node:test";
import assert from "node:assert/strict";
import {
  agentStorageKey,
  readAgentState,
  writeAgentState,
} from "../../apps/web/src/features/agent/agent-storage.ts";

const user = "12345678-1234-4234-8234-123456789012";
const conversation = "33333333-3333-4333-8333-333333333333";
const boot = "55555555-5555-4555-8555-555555555555";
const run = "019913e8-8000-7000-8000-0000000000a1";
const project = "11111111-1111-4111-8111-111111111111";
const turn = {
  runId: run,
  bootId: boot,
  message: "zrobiłem 10 pompek",
  context: { view: "list", project_id: project },
};
const state = {
  conversationId: conversation,
  acknowledged: true,
  pending: turn,
};

class Storage {
  values = new Map();
  writes = [];
  broken = false;
  constructor(initial) {
    if (initial !== undefined) this.values.set(agentStorageKey(user), initial);
  }
  check() {
    if (this.broken) throw new Error("SecurityError");
  }
  getItem(name) {
    this.check();
    return this.values.get(name) ?? null;
  }
  setItem(name, value) {
    this.check();
    this.writes.push(["set", name, value]);
    this.values.set(name, String(value));
  }
  removeItem(name) {
    this.check();
    this.writes.push(["remove", name]);
    this.values.delete(name);
  }
}

test("the key is versioned and scoped to one profile", () => {
  assert.equal(agentStorageKey(user), `astra-agent:v1:${user}`);
  assert.notEqual(agentStorageKey(user), agentStorageKey("default"));
});

test("a stored conversation with an unacknowledged turn survives a round trip", () => {
  const storage = new Storage();
  assert.equal(readAgentState(user, storage), null);
  assert.equal(writeAgentState(user, state, storage), true);
  assert.deepEqual(readAgentState(user, storage), state);
  // Another profile in the same browser sees nothing of it.
  assert.equal(readAgentState("default", storage), null);
});

test("a turn without context keeps no context", () => {
  const storage = new Storage();
  const bare = { ...state, pending: { ...turn, context: undefined } };
  writeAgentState(user, bare, storage);
  const read = readAgentState(user, storage);
  assert.equal(read.pending.context, undefined);
  assert.equal(Object.hasOwn(read.pending, "context"), false);
});

test("missing, malformed and foreign-shaped values read as no state", () => {
  for (const raw of [
    undefined,
    "",
    "not json",
    "{",
    "null",
    "[]",
    "42",
    '"text"',
    "true",
    "{}",
    JSON.stringify({ acknowledged: true }),
    // The conversation must be a version 4 identifier.
    JSON.stringify({ ...state, conversationId: "conversation" }),
    JSON.stringify({ ...state, conversationId: run }),
    JSON.stringify({
      ...state,
      conversationId: "ABCDEF01-2345-4678-9ABC-DEF012345678",
    }),
    JSON.stringify({ ...state, conversationId: 7 }),
    // The shape of another version or feature is not trusted.
    JSON.stringify({ conversation_id: conversation, runs: [] }),
  ]) {
    assert.equal(readAgentState(user, new Storage(raw)), null, String(raw));
  }
});

test("a broken store reads as no state and reports a failed write", () => {
  const storage = new Storage(JSON.stringify(state));
  storage.broken = true;
  assert.equal(readAgentState(user, storage), null);
  assert.equal(writeAgentState(user, state, storage), false);
  assert.equal(writeAgentState(user, null, storage), false);
});

test("an unusable unacknowledged turn is dropped while the conversation stays", () => {
  const damaged = [
    "text",
    42,
    [],
    {},
    // Run identifiers are version 7, boot and conversation identifiers version 4.
    { ...turn, runId: conversation },
    { ...turn, runId: "run" },
    { ...turn, bootId: run },
    { ...turn, bootId: undefined },
    { ...turn, message: "" },
    { ...turn, message: "   " },
    { ...turn, message: 5 },
    { ...turn, message: "x".repeat(8001) },
  ];
  for (const pending of damaged) {
    const read = readAgentState(
      user,
      new Storage(JSON.stringify({ ...state, pending })),
    );
    assert.deepEqual(
      read,
      { conversationId: conversation, acknowledged: true, pending: null },
      JSON.stringify(pending),
    );
  }
  assert.deepEqual(
    readAgentState(
      user,
      new Storage(JSON.stringify({ conversationId: conversation })),
    ),
    { conversationId: conversation, acknowledged: false, pending: null },
  );
});

test("only an explicit true acknowledges a conversation", () => {
  for (const acknowledged of ["true", 1, "yes", null, [], {}]) {
    const read = readAgentState(
      user,
      new Storage(JSON.stringify({ ...state, acknowledged })),
    );
    assert.equal(read.acknowledged, false, JSON.stringify(acknowledged));
  }
});

test("context keeps only a known view and a version 4 project", () => {
  const read = (context) =>
    readAgentState(
      user,
      new Storage(JSON.stringify({ ...state, pending: { ...turn, context } })),
    ).pending.context;
  assert.deepEqual(read({ view: "focus" }), { view: "focus" });
  assert.deepEqual(read({ project_id: project }), { project_id: project });
  assert.deepEqual(
    read({ view: "main", project_id: "x", extra: 1 }),
    undefined,
  );
  assert.deepEqual(read({ view: "chart", project_id: 5 }), { view: "chart" });
  assert.deepEqual(read("list"), undefined);
  assert.deepEqual(read(null), undefined);
});

test("unknown fields are not carried into the next write", () => {
  const storage = new Storage(
    JSON.stringify({ ...state, secret: "x", pending: { ...turn, extra: 1 } }),
  );
  const read = readAgentState(user, storage);
  assert.deepEqual(Object.keys(read).sort(), [
    "acknowledged",
    "conversationId",
    "pending",
  ]);
  assert.deepEqual(Object.keys(read.pending).sort(), [
    "bootId",
    "context",
    "message",
    "runId",
  ]);
});

test("writing no state removes the key instead of storing a placeholder", () => {
  const storage = new Storage();
  writeAgentState(user, state, storage);
  assert.equal(writeAgentState(user, null, storage), true);
  assert.equal(storage.values.size, 0);
  assert.deepEqual(storage.writes.at(-1), ["remove", agentStorageKey(user)]);
});

test("an unusable state is never written", () => {
  const storage = new Storage();
  writeAgentState(user, { ...state, conversationId: "bad" }, storage);
  assert.equal(storage.values.size, 0);
});
