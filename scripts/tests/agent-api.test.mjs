import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = new EventTarget();
const ended = [];
window.addEventListener("session-ended", () => ended.push(1));

const { configure, closeSession } =
  await import("../../apps/web/src/lib/api/api.ts");
const agent = await import("../../apps/web/src/lib/api/agent.ts");
const { InvalidResponseError } =
  await import("../../apps/web/src/lib/api/transport-errors.ts");

const conversation = "33333333-3333-4333-8333-333333333333";
const boot = "55555555-5555-4555-8555-555555555555";
const id = "019913e8-8000-7000-8000-0000000000a1";
const body = {
  run_id: id,
  boot_id: boot,
  conversation_id: conversation,
  message: "zrobiłem 10 pompek",
  context: { view: "list" },
};
const run = (overrides = {}) => ({
  run_id: id,
  conversation_id: conversation,
  provider: "claude",
  state: "running",
  message: "zrobiłem 10 pompek",
  reply: null,
  reply_truncated: false,
  error: null,
  created_at: "2026-10-06T08:30:00Z",
  finished_at: null,
  ...overrides,
});
const status = {
  boot_id: boot,
  provider: "claude",
  providers: [
    { id: "claude", available: true },
    { id: "codex", available: false },
  ],
};

function session() {
  configure({
    csrf_token: "csrf",
    command_epoch: "epoch",
    server_time: new Date().toISOString(),
  });
}
async function withFetch(reply, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return reply(path, init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = previous;
  }
}
const json = (status, value) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => value,
});
const failure = (status, code) =>
  json(status, { api_version: "1", error: { code, message: "English" } });
const html = (status) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => {
    throw new SyntaxError("Unexpected token '<'");
  },
});
const caught = (promise) =>
  promise.then(
    () => assert.fail("must reject"),
    (e) => e,
  );

test("starting a run POSTs the identical body to the runs path", async () => {
  session();
  await withFetch(json(202, run()), async (calls) => {
    const started = await agent.startAgentRun(body);
    assert.equal(started.state, "running");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/v1/agent/runs");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init.body), body);
    assert.equal(calls[0].init.headers["X-CSRF-Token"], "csrf");
  });
});

test("a repeated POST answered 200 returns the existing run", async () => {
  session();
  await withFetch(
    json(200, run({ state: "succeeded", reply: "Gotowe." })),
    async () => {
      const again = await agent.startAgentRun(body);
      assert.equal(again.reply, "Gotowe.");
    },
  );
});

test("reads go to their own paths and never share an in-flight request", async () => {
  session();
  const replies = {
    "/api/v1/agent": status,
    [`/api/v1/agent/runs/${id}`]: run(),
    [`/api/v1/agent/conversations/${conversation}`]: {
      conversation_id: conversation,
      provider: "claude",
      runs: [run()],
    },
  };
  await withFetch(
    async (path) => json(200, replies[path])(),
    async (calls) => {
      assert.deepEqual((await agent.getAgentStatus()).providers.length, 2);
      // Two polls of one run at once must be two exchanges, like the job polls.
      const [first, second] = await Promise.all([
        agent.getAgentRun(id),
        agent.getAgentRun(id),
      ]);
      assert.equal(first.run_id, id);
      assert.equal(second.run_id, id);
      assert.equal(calls.filter((c) => c.path.endsWith(id)).length, 2);
      const known = await agent.getAgentConversation(conversation);
      assert.equal(known.runs.length, 1);
    },
  );
});

test("cancelling POSTs an empty object to the run's cancel path", async () => {
  session();
  await withFetch(json(200, run({ state: "cancelled" })), async (calls) => {
    const cancelled = await agent.cancelAgentRun(id);
    assert.equal(cancelled.state, "cancelled");
    assert.equal(calls[0].path, `/api/v1/agent/runs/${id}/cancel`);
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init.body), {});
  });
});

test("a reply outside the contract is an unreadable reply, never a run", async () => {
  session();
  const malformed = [
    "text",
    null,
    [],
    {},
    run({ state: "paused" }),
    run({ provider: "gemini" }),
    run({ run_id: 7 }),
    run({ reply: 5 }),
    run({ reply_truncated: "no" }),
    run({ error: { code: 5, detail: null } }),
    run({ error: "failed" }),
    run({ message: undefined }),
  ];
  for (const value of malformed)
    await withFetch(json(200, value), async () => {
      assert(
        (await caught(agent.getAgentRun(id))) instanceof InvalidResponseError,
      );
      assert(
        (await caught(agent.startAgentRun(body))) instanceof
          InvalidResponseError,
      );
    });
  for (const value of [
    {},
    { ...status, boot_id: "boot" },
    { ...status, provider: "gemini" },
    { ...status, providers: [{ id: "claude" }] },
    { ...status, providers: "claude" },
  ])
    await withFetch(json(200, value), async () => {
      assert(
        (await caught(agent.getAgentStatus())) instanceof InvalidResponseError,
      );
    });
  for (const value of [
    {},
    { conversation_id: conversation, provider: "claude", runs: [{}] },
    { conversation_id: conversation, provider: "claude", runs: "none" },
  ])
    await withFetch(json(200, value), async () => {
      assert(
        (await caught(agent.getAgentConversation(conversation))) instanceof
          InvalidResponseError,
      );
    });
  // A run may carry a failure with or without detail.
  await withFetch(
    json(
      200,
      run({
        state: "failed",
        error: { code: "AGENT_PROVIDER_FAILED", detail: null },
      }),
    ),
    async () => assert.equal((await agent.getAgentRun(id)).error.detail, null),
  );
});

test("a send that started nothing is a rejection, except a restart", async () => {
  session();
  const rejected = [
    [404, "AGENT_DISABLED"],
    [409, "AGENT_RUN_ID_REUSED"],
    [409, "AGENT_RUN_ACTIVE"],
    [409, "AGENT_PROVIDER_UNAVAILABLE"],
    [409, "AGENT_CLI_UNAVAILABLE"],
    [409, "AGENT_INSTRUCTIONS_MISSING"],
    [429, "AGENT_BUSY"],
    [422, "VALIDATION_FAILED"],
  ];
  for (const [status, code] of rejected)
    await withFetch(failure(status, code), async () => {
      const error = await caught(agent.startAgentRun(body));
      assert.deepEqual(
        agent.startFailure(error),
        { kind: "rejected", code },
        code,
      );
    });
  await withFetch(failure(409, "AGENT_HOST_RESTARTED"), async () => {
    const error = await caught(agent.startAgentRun(body));
    assert.deepEqual(agent.startFailure(error), { kind: "restarted" });
  });
});

test("a send with no usable answer is unknown, whatever the reason", async () => {
  session();
  const replies = [
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async () => {
      throw new DOMException("Aborted", "AbortError");
    },
    failure(500, "INTERNAL"),
    failure(503, "SERVER_BUSY"),
    failure(408, "REQUEST_TIMEOUT"),
    failure(502, ""),
    html(502),
    html(200),
    json(200, { not: "a run" }),
    // Unrelated client errors do not prove the host refused this message.
    failure(403, "CSRF_MISMATCH"),
    failure(400, "INVALID_JSON"),
  ];
  for (const reply of replies)
    await withFetch(reply, async () => {
      const error = await caught(agent.startAgentRun(body));
      assert.deepEqual(
        agent.startFailure(error),
        { kind: "unknown" },
        String(error),
      );
    });
});

test("a 401 is a session loss for every operation, and ends the session once", async () => {
  session();
  ended.length = 0;
  await withFetch(failure(401, "SESSION_REQUIRED"), async () => {
    const error = await caught(agent.startAgentRun(body));
    assert.deepEqual(agent.startFailure(error), { kind: "session" });
    assert.deepEqual(agent.readFailure(await caught(agent.getAgentRun(id))), {
      kind: "session",
    });
  });
  assert.equal(ended.length, 1);
  await withFetch(html(401), async () => {
    session();
    assert.deepEqual(agent.readFailure(await caught(agent.getAgentRun(id))), {
      kind: "session",
    });
    assert.deepEqual(
      agent.startFailure(await caught(agent.startAgentRun(body))),
      { kind: "session" },
    );
  });
  closeSession();
});

test("a poll distinguishes a host that forgot from a host that is unreachable", async () => {
  session();
  for (const code of [
    "AGENT_RUN_NOT_FOUND",
    "AGENT_CONVERSATION_NOT_FOUND",
    "AGENT_DISABLED",
  ])
    await withFetch(failure(404, code), async () => {
      const error = await caught(agent.getAgentRun(id));
      assert.deepEqual(agent.readFailure(error), { kind: "not-found" }, code);
    });
  const unreachable = [
    async () => {
      throw new TypeError("Failed to fetch");
    },
    failure(500, "INTERNAL"),
    failure(502, ""),
    html(502),
    html(404),
    json(200, { state: "running" }),
    // A bare 404 from a proxy is not the host saying it forgot the run.
    failure(404, "NOT_FOUND"),
  ];
  for (const reply of unreachable)
    await withFetch(reply, async () => {
      const error = await caught(agent.getAgentRun(id));
      assert.deepEqual(
        agent.readFailure(error),
        { kind: "unreachable" },
        String(error),
      );
    });
});
