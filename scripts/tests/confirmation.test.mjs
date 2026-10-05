import test from "node:test";
import assert from "node:assert/strict";
import {
  invalidConfirmation,
  validCommandError,
  validateCommandReply,
  validateCommandStatus,
} from "../../apps/web/src/lib/api/confirmation.ts";

// Requests are UUIDv7; resources, jobs and users are UUIDv4.
const requestId = "0199a000-0000-7000-8000-000000000001";
const otherRequest = "0199a000-0000-7000-8000-000000000002";
const v4 = "12345678-1234-4234-8234-123456789012";
const notV4 = [
  requestId,
  "abcdef01-2345-4678-9abc-def012345678".toUpperCase(),
  "12345678-1234-4234-c234-123456789012",
  "12345678-1234-1234-8234-123456789012",
  `${v4}0`,
  v4.replaceAll("-", ""),
  "",
  42,
  null,
];
const revision = "r1." + "a".repeat(64);
const invalidMessage =
  "Nieprawidłowa odpowiedź polecenia. Sprawdź pierwotne polecenie przed ponowieniem.";

const command = (overrides = {}) =>
  Object.freeze({
    path: "/api/v1/workspace/preferences",
    method: "PATCH",
    payload: { locale: "en" },
    version: revision,
    requestId,
    epoch: "epoch",
    ...overrides,
  });
const pending = command();
const cardCommand = command({ path: "/api/v1/projects/alpha/cards/c1" });
const workflows = [
  command({ path: "/api/v1/registrations", method: "POST" }),
  command({ path: "/api/v1/projects/alpha/tags/rename", method: "POST" }),
];
const committed = (overrides = {}) => ({
  api_version: "1",
  request_id: requestId,
  status: "committed",
  result: { type: "preferences" },
  warnings: [],
  replayed: false,
  ...overrides,
});
const card = (overrides = {}) =>
  committed({ result: { type: "card", ...overrides } });
const resource = (overrides = {}) => ({
  type: "card",
  metadata: { title: "Card" },
  body: "",
  version: revision,
  ...overrides,
});
const status = (state, overrides = {}) => ({
  api_version: "1",
  request_id: requestId,
  state,
  ...overrides,
});
const failure = (overrides = {}) => ({
  api_version: "1",
  error: { code: "VERSION_CONFLICT", message: "Conflict", ...overrides },
});
const running = (overrides = {}) => ({
  api_version: "1",
  request_id: requestId,
  status: "running",
  job_id: v4,
  ...overrides,
});

const accepts = (value, expected = pending, http) =>
  assert.doesNotThrow(
    () => validateCommandReply(value, expected, http),
    JSON.stringify([value, http]),
  );
const refuses = (value, expected = pending, http) =>
  assert.throws(
    () => validateCommandReply(value, expected, http),
    { message: invalidMessage },
    JSON.stringify([value, http]),
  );
const without = (value, key) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

test("an invalid confirmation always raises the retained-command error", () => {
  assert.throws(() => invalidConfirmation(), {
    name: "Error",
    message: invalidMessage,
  });
});

test("a committed or no-op reply is accepted for a successful HTTP status or a later check", () => {
  for (const http of [undefined, 200, 201])
    for (const outcome of ["committed", "noop"])
      for (const replayed of [false, true])
        accepts(committed({ status: outcome, replayed }), pending, http);
});

test("a committed reply under any other HTTP status is refused", () => {
  for (const http of [0, 202, 204, 304, 400, 412, 500])
    refuses(committed(), pending, http);
});

test("a reply must be the version 1 envelope with exactly the known fields", () => {
  for (const key of Object.keys(committed()))
    refuses(without(committed(), key), pending, 200);
  for (const value of [
    committed({ api_version: 1 }),
    committed({ status: "running" }),
    committed({ status: "rejected" }),
    committed({ replayed: "false" }),
    committed({ replayed: null }),
    committed({ warnings: null }),
    committed({ warnings: {} }),
    // No envelope carries its own epoch, user or state alongside the result.
    committed({ epoch: "epoch" }),
    committed({ user_id: v4 }),
    committed({ state: "committed" }),
    [committed()],
    JSON.stringify(committed()),
    null,
    undefined,
    true,
    0,
  ])
    for (const http of [undefined, 200]) refuses(value, pending, http);
});

test("every envelope names the pending request by its lowercase UUIDv7", () => {
  // A request ID of another shape is refused even when it echoes the command.
  for (const id of [
    v4,
    "0199A000-0000-7000-8000-00000000000A",
    "0199a000-0000-7000-c000-000000000001",
    "0199a000-0000-7000-8000-00000000000",
    "0199a00000007000800000000000000001",
    "",
  ]) {
    const echoed = command({ requestId: id });
    refuses(committed({ request_id: id }), echoed);
    refuses(running({ request_id: id }), { ...workflows[0], requestId: id });
    refuses(status("prepared", { request_id: id }), echoed);
    assert.throws(() =>
      validateCommandStatus(status("prepared", { request_id: id }), echoed),
    );
    assert.equal(validCommandError(failure({ request_id: id }), echoed), false);
  }
  const lowercase = "0199a000-0000-7abc-bdef-0123456789ab";
  const echoed = command({ requestId: lowercase });
  accepts(committed({ request_id: lowercase }), echoed, 200);
  accepts(status("blocked", { request_id: lowercase }), echoed, 202);
  assert.equal(
    validCommandError(failure({ request_id: lowercase }), echoed),
    true,
  );
  for (const id of [otherRequest, undefined, null, 7]) {
    refuses(running({ request_id: id }), workflows[0], 202);
    refuses(status("prepared", { request_id: id }), pending, 202);
  }
  for (const id of [undefined, null, 7]) refuses(committed({ request_id: id }));
});

test("the confirmed result type must be the one the command path produces", () => {
  const types = [
    "project",
    "card",
    "milestone",
    "update",
    "focus",
    "preferences",
    "tags",
    "receipt",
    "job",
    "user",
  ];
  for (const [path, expected] of [
    ["/api/v1/projects/alpha", "project"],
    ["/api/v1/projects/alpha/cards", "card"],
    ["/api/v1/projects/alpha/cards/c1", "card"],
    ["/api/v1/projects/alpha/milestones", "milestone"],
    ["/api/v1/projects/alpha/milestones/m1", "milestone"],
    ["/api/v1/projects/alpha/updates", "update"],
    ["/api/v1/projects/alpha/updates/u1", "update"],
    ["/api/v1/workspace/focus", "focus"],
    ["/api/v1/workspace/preferences", "preferences"],
    ["/api/v1/workspace/tags", "tags"],
    ["/api/v1/workspace/read-receipts", "receipt"],
    ["/api/v1/registrations", "job"],
    ["/api/v1/projects/alpha/tags/rename", "job"],
  ]) {
    const expectedCommand = command({ path });
    for (const type of types) {
      const reply = committed({ result: { type } });
      if (type === expected) accepts(reply, expectedCommand);
      else refuses(reply, expectedCommand);
    }
    refuses(committed({ result: {} }), expectedCommand);
  }
});

test("a result may identify, version or delete its resource but nothing more", () => {
  for (const result of [
    { id: v4 },
    { job_id: v4 },
    { version: revision },
    { id: v4, version: revision, job_id: v4 },
    { deleted: true },
    { deleted: true, id: v4 },
  ])
    accepts(card(result), cardCommand, 200);
  for (const result of [
    ...notV4.flatMap((id) => [{ id }, { job_id: id }]),
    { version: "r1." + "a".repeat(63) },
    { version: "r1." + "a".repeat(65) },
    { version: "r2." + "a".repeat(64) },
    { version: "r1." + "A".repeat(64) },
    { version: "a".repeat(64) },
    { version: 1 },
    { version: null },
    { deleted: false },
    { deleted: "true" },
    { deleted: null },
    { deleted: true, version: revision },
    { deleted: true, resource: resource() },
    { etag: revision },
    { type: ["card"] },
  ])
    refuses(card(result), cardCommand, 200);
  for (const result of [null, undefined, "card", ["card"], 1])
    refuses(committed({ result }), cardCommand, 200);
});

test("an embedded resource must be a complete resource of the confirmed type", () => {
  for (const [path, type] of [
    ["/api/v1/projects/alpha", "project"],
    ["/api/v1/projects/alpha/cards/c1", "card"],
    ["/api/v1/projects/alpha/milestones/m1", "milestone"],
    ["/api/v1/projects/alpha/updates", "update"],
  ])
    accepts(
      committed({
        result: {
          type,
          id: v4,
          version: revision,
          resource: resource({ type }),
        },
      }),
      command({ path }),
      200,
    );
  accepts(
    card({ resource: resource({ metadata: {}, body: "# Text" }) }),
    cardCommand,
  );
  for (const value of [
    resource({ type: "milestone" }),
    resource({ type: "preferences" }),
    resource({ metadata: null }),
    resource({ metadata: [] }),
    resource({ metadata: "title" }),
    resource({ body: null }),
    resource({ body: ["text"] }),
    resource({ version: "r1" }),
    resource({ id: v4 }),
    ...Object.keys(resource()).map((key) => without(resource(), key)),
    {},
    [],
    null,
    "card",
  ])
    refuses(card({ resource: value }), cardCommand, 200);
  // Only project sources travel as resources.
  refuses(
    committed({
      result: {
        type: "preferences",
        resource: resource({ type: "preferences" }),
      },
    }),
  );
});

test("warnings are bounded text records with an optional field", () => {
  const warning = { code: "UNKNOWN_TAG", message: "Unknown tag" };
  const emoji = (count) => "🙂".repeat(count);
  for (const warnings of [
    [warning],
    [{ ...warning, field: "tags" }],
    Array.from({ length: 100 }, () => warning),
    // Limits count characters, not UTF-16 units.
    [
      {
        code: "c".repeat(80),
        message: "m".repeat(1000),
        field: "f".repeat(120),
      },
    ],
    [{ code: emoji(80), message: emoji(1000), field: emoji(120) }],
  ])
    accepts(committed({ warnings }), pending, 200);
  for (const warnings of [
    Array.from({ length: 101 }, () => warning),
    [warning, null],
    [warning, "UNKNOWN_TAG"],
    [[]],
    [{ ...warning, severity: "low" }],
    [{ message: "Unknown tag" }],
    [{ code: "UNKNOWN_TAG" }],
    [{ ...warning, code: "" }],
    [{ ...warning, code: "c".repeat(81) }],
    [{ ...warning, code: emoji(81) }],
    [{ ...warning, code: 7 }],
    [{ ...warning, message: "" }],
    [{ ...warning, message: "m".repeat(1001) }],
    [{ ...warning, field: "" }],
    [{ ...warning, field: "f".repeat(121) }],
    [{ ...warning, field: null }],
    [{ ...warning, field: ["tags"] }],
  ])
    refuses(committed({ warnings }), pending, 200);
});

test("a running workflow is confirmed only by its accepted job", () => {
  for (const workflow of workflows) {
    for (const http of [undefined, 202]) accepts(running(), workflow, http);
    for (const http of [200, 201, 204, 500]) refuses(running(), workflow, http);
    for (const value of [
      ...notV4.map((job_id) => running({ job_id })),
      without(running(), "job_id"),
      without(running(), "api_version"),
      running({ api_version: "2" }),
      running({ status: "queued" }),
      running({ result: { type: "job" } }),
      running({ warnings: [] }),
    ])
      refuses(value, workflow, 202);
  }
  for (const expected of [pending, cardCommand])
    for (const http of [undefined, 202]) refuses(running(), expected, http);
});

test("a workflow's committed job is confirmed only by a later status check", () => {
  for (const workflow of workflows) {
    const done = committed({ result: { type: "job", job_id: v4 } });
    accepts(done, workflow);
    for (const http of [200, 201, 202]) refuses(done, workflow, http);
    assert.doesNotThrow(() =>
      validateCommandStatus(status("committed", { result: done }), workflow),
    );
  }
});

test("an unfinished command status is accepted as a deferred reply only under 202", () => {
  for (const state of ["prepared", "blocked", "needs_review"]) {
    for (const http of [undefined, 202]) accepts(status(state), pending, http);
    for (const http of [200, 201, 204, 409, 500])
      refuses(status(state), pending, http);
    refuses(status(state, { api_version: "2" }), pending, 202);
    refuses(status(state, { job_id: v4 }), pending, 202);
    refuses(status(state, { error: failure() }), pending, 202);
  }
  // Finished or unknown states are never a direct command reply.
  for (const value of [
    status("committed", { result: committed() }),
    status("rejected", { error: failure() }),
    status("running"),
    status("PREPARED"),
    status(""),
    { state: "prepared" },
  ])
    for (const http of [undefined, 202]) refuses(value, pending, http);
});

test("a status check accepts each state with exactly the evidence it requires", () => {
  const valid = [
    status("prepared"),
    status("blocked"),
    status("needs_review"),
    status("committed", { result: committed() }),
    status("committed", { result: committed({ status: "noop" }) }),
    status("committed", { result: committed({ replayed: true }) }),
    status("rejected", { error: failure() }),
    status("rejected", { error: failure({ request_id: requestId }) }),
    status("rejected", { error: failure({ details: { current: revision } }) }),
  ];
  for (const value of valid)
    assert.doesNotThrow(
      () => validateCommandStatus(value, pending),
      JSON.stringify(value),
    );
  assert.doesNotThrow(() =>
    validateCommandStatus(
      status("committed", {
        result: card({ id: v4, version: revision, resource: resource() }),
      }),
      cardCommand,
    ),
  );
});

test("a status check refuses missing, contradictory or malformed evidence", () => {
  for (const value of [
    status("committed"),
    status("committed", { error: failure() }),
    status("committed", { result: null }),
    status("committed", { result: { type: "preferences" } }),
    status("committed", { result: committed({ request_id: otherRequest }) }),
    status("committed", { result: committed({ result: { type: "card" } }) }),
    status("committed", { result: committed({ status: "running" }) }),
    status("committed", { result: status("committed") }),
    status("prepared", { error: failure() }),
    status("blocked", { error: failure() }),
    status("needs_review", { error: failure() }),
    status("rejected", { error: null }),
    status("rejected", { error: "VERSION_CONFLICT" }),
    status("rejected", { error: failure().error }),
    status("rejected", { error: failure({ code: "" }) }),
    status("rejected", { error: failure({ request_id: otherRequest }) }),
    status("running"),
    status("Committed", { result: committed() }),
    status(undefined),
    status(null),
    status("prepared", { api_version: "2" }),
    status("prepared", { job_id: v4 }),
    status("prepared", { epoch: "epoch" }),
    without(status("prepared"), "api_version"),
    without(status("prepared"), "request_id"),
    [status("prepared")],
    "prepared",
    null,
    undefined,
  ])
    assert.throws(
      () => validateCommandStatus(value, pending),
      { message: invalidMessage },
      JSON.stringify(value),
    );
});

test("a command error is a bounded code and message for this request", () => {
  for (const value of [
    failure(),
    failure({ request_id: requestId }),
    failure({ details: {} }),
    failure({ request_id: requestId, details: { current: revision, n: [1] } }),
    failure({ code: "c".repeat(80), message: "m".repeat(2000) }),
    failure({ code: "🙂".repeat(80), message: "🙂".repeat(2000) }),
  ])
    assert.equal(validCommandError(value, pending), true);
});

test("a malformed or foreign command error is not a confirmation", () => {
  for (const value of [
    failure({ request_id: otherRequest }),
    failure({ request_id: v4 }),
    failure({ request_id: null }),
    failure({ request_id: "" }),
    failure({ code: "" }),
    failure({ code: "c".repeat(81) }),
    failure({ code: 409 }),
    failure({ code: undefined }),
    failure({ message: "" }),
    failure({ message: "m".repeat(2001) }),
    failure({ message: "🙂".repeat(2001) }),
    failure({ message: undefined }),
    failure({ message: ["Conflict"] }),
    failure({ details: null }),
    failure({ details: [] }),
    failure({ details: "current" }),
    failure({ status: 409 }),
    { ...failure(), api_version: "2" },
    { ...failure(), api_version: 1 },
    { ...failure(), request_id: requestId },
    { ...failure(), error: null },
    { ...failure(), error: [] },
    { ...failure(), error: "VERSION_CONFLICT" },
    { error: failure().error },
    { api_version: "1" },
    failure().error,
    committed(),
    [],
    "VERSION_CONFLICT",
    null,
    undefined,
  ])
    assert.equal(
      validCommandError(value, pending),
      false,
      JSON.stringify(value),
    );
});

test("a user confirmation carries a UUIDv4 profile matching the submitted command", () => {
  const profile = { id: v4, name: "Alex", is_default: false };
  const creation = command({
    path: "/api/v1/users",
    method: "POST",
    payload: { id: v4, name: "Alex" },
  });
  const rename = command({
    path: `/api/v1/users/${v4}`,
    payload: { name: "Alex" },
  });
  const user = (overrides = {}, result = {}) =>
    committed({
      result: {
        type: "user",
        id: v4,
        version: revision,
        resource: { ...profile, ...overrides },
        ...result,
      },
    });
  accepts(user(), creation, 201);
  accepts(user(), rename, 200);
  accepts(user({ is_default: true }), rename, 200);
  const longest = "ż".repeat(120);
  accepts(
    user({ name: longest }),
    { ...creation, payload: { id: v4, name: longest } },
    201,
  );
  for (const [value, expected = creation] of [
    [user({ is_default: "false" })],
    [user({ is_default: undefined })],
    [user({ role: "owner" })],
    [user({ name: "" }), { ...creation, payload: { id: v4, name: "" } }],
    [
      user({ name: `${longest}ż` }),
      { ...creation, payload: { id: v4, name: `${longest}ż` } },
    ],
    [user({}, { resource: undefined })],
    [user({}, { resource: resource({ type: "user" }) })],
    [user({}, { deleted: true })],
    [user(), { ...creation, payload: null }],
    [user(), { ...creation, payload: "Alex" }],
    [user(), { ...creation, payload: [v4, "Alex"] }],
    [user(), { ...creation, payload: { id: v4 } }],
    // Only creation and rename are confirmed for a profile.
    [user(), { ...creation, method: "PUT" }],
    [user(), { ...rename, method: "DELETE" }],
    [user(), { ...rename, method: "POST" }],
    [user({ is_default: "true" }), rename],
    [user({}, { resource: undefined }), rename],
    [user(), { ...rename, payload: null }],
    [user(), { ...rename, payload: {} }],
  ])
    refuses(value, expected, 200);
  // A profile identified by anything but a UUIDv4 is refused even when echoed.
  for (const id of notV4.filter((value) => typeof value === "string")) {
    refuses(
      user({ id }, { id }),
      { ...creation, payload: { id, name: "Alex" } },
      201,
    );
    refuses(user({ id }, { id }), { ...rename, path: `/api/v1/users/${id}` });
  }
});
