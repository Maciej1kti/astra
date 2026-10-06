import test from "node:test";
import assert from "node:assert/strict";
import {
  activeTurn,
  canSend,
  formatElapsed,
  newChat,
  pollDelay,
  postInput,
  reduce,
  retryDelays,
  storedState,
} from "../../apps/web/src/features/agent/agent-chat.ts";

const conversation = "33333333-3333-4333-8333-333333333333";
const next = "44444444-4444-4444-8444-444444444444";
const boot = "55555555-5555-4555-8555-555555555555";
const rebooted = "66666666-6666-4666-8666-666666666666";
const project = "11111111-1111-4111-8111-111111111111";
const id = (n) => `019913e8-8000-7000-8000-${String(n).padStart(12, "0")}`;
const context = { view: "list", project_id: project };

const run = (overrides = {}) => ({
  run_id: id(1),
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
const final = (state, overrides = {}) =>
  run({
    state,
    finished_at: "2026-10-06T08:30:12Z",
    ...(state === "succeeded" ? { reply: "Gotowe." } : {}),
    ...overrides,
  });

/** Feed events one by one, keeping every step's effects. */
function play(chat, ...events) {
  const steps = [];
  for (const event of events) {
    const step = reduce(chat, event);
    steps.push(step);
    chat = step.chat;
  }
  return {
    chat,
    steps,
    last: steps.at(-1),
    effects: steps.flatMap((s) => s.effects),
  };
}
const ready = () =>
  reduce(newChat(conversation), { type: "status", bootId: boot }).chat;
const send = (runId = id(1), message = "zrobiłem 10 pompek", now = 0) => ({
  type: "send",
  runId,
  message,
  context,
  now,
});
const sent = (n = 1) => reduce(ready(), send(id(n))).chat;
const running = (now = 100) =>
  play(sent(), { type: "posted", runId: id(1), run: run(), now }).chat;
const turnOf = (chat, n = 1) => chat.turns.find((t) => t.runId === id(n));
const failure = (kind, extra = {}) => ({ kind, ...extra });
const post = (type, extra = {}) => ({
  type,
  runId: id(1),
  now: 1000,
  ...extra,
});

test("a new conversation is empty, unacknowledged and not yet bound to a host", () => {
  const chat = newChat(conversation);
  assert.deepEqual(chat, {
    conversationId: conversation,
    provider: null,
    acknowledged: false,
    bootId: null,
    turns: [],
    paused: false,
    notice: "",
    sendError: "",
  });
  assert.equal(canSend(chat, "hello"), false, "no boot ID is known yet");
});

test("sending needs text, a boot ID, a free conversation and no session loss", () => {
  const chat = ready();
  assert.equal(canSend(chat, "zrobiłem 10 pompek"), true);
  for (const text of ["", "   ", "\n\t "])
    assert.equal(canSend(chat, text), false);
  assert.equal(canSend(chat, "x".repeat(8000)), true);
  assert.equal(canSend(chat, "x".repeat(8001)), false);
  assert.equal(canSend({ ...chat, paused: true }, "hello"), false);
  // One turn at a time, whatever stage it is in.
  assert.equal(canSend(sent(), "next"), false);
  assert.equal(canSend(running(), "next"), false);
  const finished = play(
    running(),
    post("polled", { run: final("succeeded") }),
  ).chat;
  assert.equal(canSend(finished, "next"), true);
});

test("sending adds a sending turn and asks for exactly one immediate POST", () => {
  const { chat, effects } = reduce(
    ready(),
    send(id(1), "  zrobiłem 10 pompek \n", 5),
  );
  assert.equal(chat.turns.length, 1);
  assert.deepEqual(
    { ...chat.turns[0] },
    {
      runId: id(1),
      bootId: boot,
      // The sent text is the trimmed text; a retry must reuse it unchanged.
      message: "zrobiłem 10 pompek",
      context,
      state: "sending",
      startedAt: 5,
      attempts: 0,
      resumed: false,
      exhausted: false,
      cancel: "none",
      pollFailures: 0,
      reply: null,
      replyTruncated: false,
      error: null,
    },
  );
  assert.deepEqual(effects, [{ kind: "post", runId: id(1), delay: 0 }]);
  assert.deepEqual(postInput(chat, id(1)), {
    run_id: id(1),
    boot_id: boot,
    conversation_id: conversation,
    message: "zrobiłem 10 pompek",
    context,
  });
});

test("an invalid or concurrent send changes nothing", () => {
  const busy = sent();
  for (const [chat, event] of [
    [ready(), send(id(2), "   ")],
    [ready(), send(id(2), "x".repeat(8001))],
    [newChat(conversation), send(id(2))],
    [busy, send(id(2), "second")],
  ]) {
    const step = reduce(chat, event);
    assert.equal(step.chat, chat);
    assert.deepEqual(step.effects, []);
  }
});

test("a send without context sends no context", () => {
  const chat = reduce(ready(), {
    type: "send",
    runId: id(1),
    message: "hello",
    now: 0,
  }).chat;
  assert.equal(Object.hasOwn(postInput(chat, id(1)), "context"), false);
});

test("an accepted POST starts polling after a second and acknowledges the conversation", () => {
  const { chat, last } = play(sent(), {
    type: "posted",
    runId: id(1),
    run: run({ provider: "codex" }),
    now: 40,
  });
  assert.equal(turnOf(chat).state, "running");
  assert.equal(chat.acknowledged, true);
  assert.equal(chat.provider, "codex", "the conversation keeps its provider");
  assert.deepEqual(last.effects, [{ kind: "poll", runId: id(1), delay: 1000 }]);
  assert.equal(activeTurn(chat)?.runId, id(1));
});

test("a repeated POST that returns an already finished run settles without polling", () => {
  const { chat, last } = play(sent(), {
    type: "posted",
    runId: id(1),
    run: final("succeeded"),
    now: 40,
  });
  assert.equal(turnOf(chat).state, "succeeded");
  assert.equal(turnOf(chat).reply, "Gotowe.");
  assert.equal(
    last.effects.some((e) => e.kind === "poll"),
    false,
  );
  assert.equal(activeTurn(chat), undefined);
});

test("polling is every second for fifteen seconds, then every two", () => {
  assert.equal(pollDelay(0, 0), 1000);
  assert.equal(pollDelay(14_999, 0), 1000);
  assert.equal(pollDelay(15_000, 0), 2000);
  assert.equal(pollDelay(600_000, 0), 2000);
  const chat = running(0);
  for (const [now, delay] of [
    [1_000, 1000],
    [14_000, 1000],
    [16_000, 2000],
    [90_000, 2000],
  ]) {
    const step = reduce(chat, {
      type: "polled",
      runId: id(1),
      run: run(),
      now,
    });
    assert.deepEqual(
      step.effects,
      [{ kind: "poll", runId: id(1), delay }],
      String(now),
    );
  }
});

test("a poll that finds the run finished settles the turn", () => {
  for (const [state, extra] of [
    ["succeeded", { reply_truncated: true }],
    [
      "failed",
      { error: { code: "AGENT_PROVIDER_FAILED", detail: "fake failure" } },
    ],
    ["cancelled", {}],
    ["timed_out", {}],
  ]) {
    const { chat, last } = play(running(), {
      type: "polled",
      runId: id(1),
      run: final(state, extra),
      now: 5000,
    });
    const turn = turnOf(chat);
    assert.equal(turn.state, state);
    assert.equal(turn.replyTruncated, Boolean(extra.reply_truncated));
    assert.deepEqual(turn.error, extra.error ?? null);
    assert.deepEqual(last.effects, [{ kind: "stop", runId: id(1) }]);
    assert.equal(activeTurn(chat), undefined);
  }
});

test("failed polls keep the turn running, show the hint's cause and back off to five seconds", () => {
  let chat = running(0);
  const delays = [];
  for (let attempt = 1; attempt <= 6; attempt++) {
    const step = reduce(
      chat,
      post("poll-failed", { failure: failure("unreachable"), now: 1000 }),
    );
    chat = step.chat;
    assert.equal(turnOf(chat).state, "running");
    assert.equal(turnOf(chat).pollFailures, attempt);
    delays.push(step.effects[0].delay);
    assert.equal(step.effects[0].kind, "poll");
  }
  assert.deepEqual(delays, [2000, 4000, 5000, 5000, 5000, 5000]);
  // The first answer ends the failure streak and the normal cadence resumes.
  const recovered = reduce(chat, post("polled", { run: run(), now: 2000 }));
  assert.equal(turnOf(recovered.chat).pollFailures, 0);
  assert.deepEqual(recovered.effects, [
    { kind: "poll", runId: id(1), delay: 1000 },
  ]);
  // After fifteen seconds the base interval is two seconds.
  const late = reduce(
    running(0),
    post("poll-failed", { failure: failure("unreachable"), now: 20_000 }),
  );
  assert.equal(late.effects[0].delay, 4000);
});

test("a poll the host does not know loses the turn and re-reads the boot ID", () => {
  const { chat, last } = play(
    running(),
    post("poll-failed", { failure: failure("not-found") }),
  );
  assert.equal(turnOf(chat).state, "lost");
  assert.equal(activeTurn(chat), undefined);
  assert.deepEqual(last.effects, [
    { kind: "stop", runId: id(1) },
    { kind: "status" },
  ]);
  // A lost turn blocks the composer until the owner decides.
  assert.equal(canSend(chat, "next"), false);
});

test("an uncertain POST is retried identically after 1, 2, 4 and 8 seconds and then waits", () => {
  assert.deepEqual(retryDelays, [1000, 2000, 4000, 8000]);
  let chat = sent();
  const original = postInput(chat, id(1));
  const delays = [];
  for (let failed = 1; failed <= 5; failed++) {
    // The boot ID the page reads meanwhile must not leak into a retry.
    chat = reduce(chat, { type: "status", bootId: rebooted }).chat;
    const step = reduce(
      chat,
      post("post-failed", { failure: failure("unknown") }),
    );
    chat = step.chat;
    assert.equal(turnOf(chat).state, "uncertain");
    assert.equal(turnOf(chat).attempts, failed);
    assert.deepEqual(postInput(chat, id(1)), original, `retry ${failed}`);
    delays.push(
      step.effects.map((e) => (e.kind === "post" ? e.delay : e.kind)),
    );
  }
  assert.deepEqual(delays, [[1000], [2000], [4000], [8000], []]);
  assert.equal(turnOf(chat).exhausted, true);
  assert.equal(chat.turns.length, 1);
  assert.equal(
    activeTurn(chat)?.runId,
    id(1),
    "an unconfirmed turn still blocks the composer",
  );
  assert.equal(chat.turns[0].runId, id(1));
});

test("the manual retry sends the same request and starts its own schedule", () => {
  let chat = sent();
  for (let i = 0; i < 5; i++)
    chat = reduce(
      chat,
      post("post-failed", { failure: failure("unknown") }),
    ).chat;
  assert.equal(turnOf(chat).exhausted, true);
  const original = postInput(chat, id(1));
  const step = reduce(chat, post("retry"));
  assert.equal(turnOf(step.chat).state, "sending");
  assert.equal(turnOf(step.chat).exhausted, false);
  assert.deepEqual(step.effects, [{ kind: "post", runId: id(1), delay: 0 }]);
  assert.deepEqual(postInput(step.chat, id(1)), original);
  // It is refused unless the automatic retries are really used up.
  const waiting = reduce(
    sent(),
    post("post-failed", { failure: failure("unknown") }),
  ).chat;
  assert.equal(reduce(waiting, post("retry")).chat, waiting);
  // And the schedule restarts from one second.
  const again = reduce(
    step.chat,
    post("post-failed", { failure: failure("unknown") }),
  );
  assert.deepEqual(again.effects, [
    { kind: "post", runId: id(1), delay: 1000 },
  ]);
});

test("a retried POST that is finally acknowledged continues like a first answer", () => {
  const { chat, last } = play(
    sent(),
    post("post-failed", { failure: failure("unknown") }),
    post("posted", { run: run(), now: 3000 }),
  );
  assert.equal(turnOf(chat).state, "running");
  assert.equal(turnOf(chat).attempts, 0);
  assert.deepEqual(last.effects, [{ kind: "poll", runId: id(1), delay: 1000 }]);
});

test("a refused first send removes the turn, restores the text and explains why", () => {
  for (const code of [
    "AGENT_DISABLED",
    "AGENT_RUN_ACTIVE",
    "AGENT_BUSY",
    "AGENT_PROVIDER_UNAVAILABLE",
    "AGENT_CLI_UNAVAILABLE",
    "AGENT_INSTRUCTIONS_MISSING",
    "AGENT_RUN_ID_REUSED",
    "VALIDATION_FAILED",
  ]) {
    const { chat, last } = play(
      sent(),
      post("post-failed", { failure: failure("rejected", { code }) }),
    );
    assert.deepEqual(chat.turns, [], code);
    assert.equal(chat.sendError, code);
    assert.equal(
      canSend(chat, "again"),
      true,
      "the owner can edit and send again",
    );
    assert.deepEqual(last.effects.slice(0, 2), [
      { kind: "composer", text: "zrobiłem 10 pompek" },
      { kind: "stop", runId: id(1) },
    ]);
    assert.equal(chat.acknowledged, false);
  }
});

test("a provider that cannot start asks for fresh availability", () => {
  const { last } = play(
    sent(),
    post("post-failed", {
      failure: failure("rejected", { code: "AGENT_PROVIDER_UNAVAILABLE" }),
    }),
  );
  assert(last.effects.some((e) => e.kind === "status"));
});

test("a restart refused on the first attempt started nothing and is shown as a refusal", () => {
  const { chat, last } = play(
    sent(),
    post("post-failed", { failure: failure("restarted") }),
  );
  assert.deepEqual(chat.turns, []);
  assert.equal(chat.sendError, "AGENT_HOST_RESTARTED");
  assert.deepEqual(last.effects, [
    { kind: "composer", text: "zrobiłem 10 pompek" },
    { kind: "stop", runId: id(1) },
    { kind: "status" },
  ]);
});

test("a restart refused after an earlier uncertain attempt loses the turn", () => {
  const { chat, last } = play(
    sent(),
    post("post-failed", { failure: failure("unknown") }),
    post("post-failed", { failure: failure("restarted") }),
  );
  assert.equal(turnOf(chat).state, "lost");
  assert.equal(
    turnOf(chat).message,
    "zrobiłem 10 pompek",
    "the text stays visible",
  );
  assert.equal(chat.sendError, "");
  assert.deepEqual(last.effects, [
    { kind: "stop", runId: id(1) },
    { kind: "status" },
  ]);
  assert.equal(activeTurn(chat), undefined);
});

test("a restart refused for a turn resumed after a reload loses it, never restores it", () => {
  const stored = {
    conversationId: conversation,
    acknowledged: false,
    pending: {
      runId: id(1),
      bootId: boot,
      message: "dodaj komentarz",
      context,
    },
  };
  const restored = reduce(newChat(next), {
    type: "restore",
    stored,
    remote: "not-found",
    bootId: rebooted,
    conversationId: next,
    now: 0,
  }).chat;
  const { chat } = play(
    restored,
    post("post-failed", { failure: failure("restarted") }),
  );
  assert.equal(turnOf(chat).state, "lost");
});

test("send again starts a new conversation with the fresh boot ID and a new run", () => {
  const lost = play(
    sent(),
    post("post-failed", { failure: failure("unknown") }),
    post("post-failed", { failure: failure("restarted") }),
  ).chat;
  const { chat, last } = play(lost, {
    type: "send-again",
    runId: id(1),
    newRunId: id(2),
    conversationId: next,
    bootId: rebooted,
    now: 9000,
  });
  assert.equal(chat.conversationId, next);
  assert.equal(chat.acknowledged, false);
  assert.equal(chat.provider, null);
  assert.equal(
    chat.turns.length,
    1,
    "the forgotten conversation is not carried over",
  );
  assert.deepEqual(postInput(chat, id(2)), {
    run_id: id(2),
    boot_id: rebooted,
    conversation_id: next,
    message: "zrobiłem 10 pompek",
    context,
  });
  assert.deepEqual(last.effects, [
    { kind: "stop" },
    { kind: "post", runId: id(2), delay: 0 },
  ]);
  // Only a lost turn can be sent again.
  const refused = reduce(sent(), {
    type: "send-again",
    runId: id(1),
    newRunId: id(2),
    conversationId: next,
    bootId: rebooted,
    now: 0,
  });
  assert.equal(refused.chat.conversationId, conversation);
});

test("discarding a lost turn starts an empty conversation", () => {
  const lost = play(
    running(),
    post("poll-failed", { failure: failure("not-found") }),
  ).chat;
  const { chat, last } = play(lost, { type: "discard", conversationId: next });
  assert.deepEqual(
    { ...chat, bootId: undefined },
    { ...newChat(next), bootId: undefined },
  );
  assert.equal(chat.bootId, boot, "the boot ID read meanwhile is kept");
  assert.deepEqual(last.effects, [{ kind: "stop" }]);
  assert.equal(canSend(chat, "next"), true);
});

test("a new conversation is refused while a turn is active and clears the list otherwise", () => {
  const active = sent();
  assert.equal(
    reduce(active, { type: "new-conversation", conversationId: next }).chat,
    active,
  );
  const finished = play(
    running(),
    post("polled", { run: final("succeeded") }),
  ).chat;
  const { chat, last } = play(finished, {
    type: "new-conversation",
    conversationId: next,
  });
  assert.equal(chat.conversationId, next);
  assert.deepEqual(chat.turns, []);
  assert.equal(chat.provider, null);
  assert.equal(chat.bootId, boot);
  assert.deepEqual(last.effects, [{ kind: "stop" }]);
});

test("cancel asks once, shows no final state itself and repeats safely when it failed", () => {
  const chat = running();
  const asked = reduce(chat, post("cancel"));
  assert.equal(turnOf(asked.chat).cancel, "requested");
  assert.deepEqual(asked.effects, [{ kind: "cancel", runId: id(1), delay: 0 }]);
  // A second press while it is pending does nothing.
  assert.equal(reduce(asked.chat, post("cancel")).chat, asked.chat);
  // The answer may still say running; the poll decides when it is over.
  const answered = reduce(
    asked.chat,
    post("cancel-answered", { run: run(), now: 2000 }),
  );
  assert.equal(turnOf(answered.chat).state, "running");
  assert.equal(turnOf(answered.chat).cancel, "acknowledged");
  assert.deepEqual(answered.effects, [
    { kind: "poll", runId: id(1), delay: 1000 },
  ]);
  const done = reduce(
    answered.chat,
    post("polled", { run: final("cancelled"), now: 3000 }),
  );
  assert.equal(turnOf(done.chat).state, "cancelled");
  // A transport failure asks again later.
  const failed = reduce(
    asked.chat,
    post("cancel-failed", { failure: failure("unreachable") }),
  );
  assert.equal(turnOf(failed.chat).cancel, "requested");
  assert.deepEqual(failed.effects, [
    { kind: "cancel", runId: id(1), delay: 2000 },
  ]);
  // Cancelling anything but a running turn is ignored.
  assert.equal(reduce(sent(), post("cancel")).chat.turns[0].cancel, "none");
});

test("a cancel the host cannot find loses the turn", () => {
  const asked = reduce(running(), post("cancel")).chat;
  const { chat } = play(
    asked,
    post("cancel-failed", { failure: failure("not-found") }),
  );
  assert.equal(turnOf(chat).state, "lost");
});

test("a cancel that races with completion shows the completed answer", () => {
  const asked = reduce(running(), post("cancel")).chat;
  const { chat } = play(
    asked,
    post("cancel-answered", { run: final("succeeded"), now: 3000 }),
  );
  assert.equal(turnOf(chat).state, "succeeded");
});

test("session loss pauses every timer and keeps the turn; restoration resumes it", () => {
  const sending = sent();
  const paused = reduce(sending, { type: "session-ended" });
  assert.equal(paused.chat.paused, true);
  assert.deepEqual(paused.effects, [{ kind: "stop" }]);
  assert.equal(turnOf(paused.chat).state, "sending");
  assert.equal(
    reduce(paused.chat, { type: "session-ended" }).chat,
    paused.chat,
  );
  assert.equal(canSend(paused.chat, "x"), false);
  // Nothing happens while paused.
  assert.deepEqual(reduce(paused.chat, { type: "wake", now: 5 }).effects, []);
  const resumed = reduce(paused.chat, { type: "session-restored", now: 9 });
  assert.equal(resumed.chat.paused, false);
  assert.deepEqual(resumed.effects, [{ kind: "post", runId: id(1), delay: 0 }]);
  assert.deepEqual(postInput(resumed.chat, id(1)), postInput(sending, id(1)));
  // A restoration without a loss is not an event.
  assert.equal(
    reduce(sending, { type: "session-restored", now: 9 }).chat,
    sending,
  );

  const polling = reduce(running(), { type: "session-ended" }).chat;
  assert.deepEqual(
    reduce(polling, { type: "session-restored", now: 9 }).effects,
    [{ kind: "poll", runId: id(1), delay: 0 }],
  );
  const cancelling = reduce(reduce(running(), post("cancel")).chat, {
    type: "session-ended",
  }).chat;
  assert.deepEqual(
    reduce(cancelling, { type: "session-restored", now: 9 }).effects,
    [
      { kind: "poll", runId: id(1), delay: 0 },
      { kind: "cancel", runId: id(1), delay: 0 },
    ],
  );
  // Retries that were used up stay manual.
  let exhausted = sent();
  for (let i = 0; i < 5; i++)
    exhausted = reduce(
      exhausted,
      post("post-failed", { failure: failure("unknown") }),
    ).chat;
  const idle = reduce(reduce(exhausted, { type: "session-ended" }).chat, {
    type: "session-restored",
    now: 9,
  });
  assert.deepEqual(idle.effects, []);
});

test("a 401 on the POST or a poll pauses without spending a retry or losing the turn", () => {
  const post401 = reduce(
    sent(),
    post("post-failed", { failure: failure("session") }),
  );
  assert.equal(post401.chat.paused, true);
  assert.equal(turnOf(post401.chat).attempts, 0);
  assert.equal(turnOf(post401.chat).state, "sending");
  assert.deepEqual(post401.effects, [{ kind: "stop" }]);
  const poll401 = reduce(
    running(),
    post("poll-failed", { failure: failure("session") }),
  );
  assert.equal(poll401.chat.paused, true);
  assert.equal(turnOf(poll401.chat).state, "running");
  const cancel401 = reduce(
    reduce(running(), post("cancel")).chat,
    post("cancel-failed", { failure: failure("session") }),
  );
  assert.equal(cancel401.chat.paused, true);
});

test("becoming visible or online polls a running turn at once", () => {
  const woken = reduce(running(), { type: "wake", now: 5000 });
  assert.deepEqual(woken.effects, [{ kind: "poll", runId: id(1), delay: 0 }]);
  assert.deepEqual(reduce(sent(), { type: "wake", now: 5000 }).effects, []);
  assert.deepEqual(reduce(ready(), { type: "wake", now: 5000 }).effects, []);
});

test("late answers for turns that are gone or settled are ignored", () => {
  const settled = play(
    running(),
    post("polled", { run: final("succeeded") }),
  ).chat;
  for (const event of [
    post("posted", { run: run() }),
    post("polled", {
      run: final("failed", { error: { code: "X", detail: null } }),
    }),
    post("poll-failed", { failure: failure("not-found") }),
    post("post-failed", { failure: failure("unknown") }),
    { type: "polled", runId: id(9), run: run({ run_id: id(9) }), now: 0 },
  ]) {
    const step = reduce(settled, event);
    assert.equal(step.chat, settled, JSON.stringify(event).slice(0, 60));
    assert.deepEqual(step.effects, []);
  }
  assert.equal(turnOf(settled).state, "succeeded");
});

test("restoring a known conversation lists its runs and resumes polling a running one", () => {
  const runs = [
    final("succeeded", { run_id: id(1), message: "first", reply: "one" }),
    run({
      run_id: id(2),
      message: "second",
      created_at: "2026-10-06T08:31:00Z",
    }),
  ];
  const { chat, last } = play(newChat(next), {
    type: "restore",
    stored: { conversationId: conversation, acknowledged: true, pending: null },
    remote: { conversation_id: conversation, provider: "codex", runs },
    bootId: boot,
    conversationId: next,
    now: Date.parse("2026-10-06T08:31:05Z"),
  });
  assert.equal(chat.conversationId, conversation);
  assert.equal(chat.provider, "codex");
  assert.equal(chat.acknowledged, true);
  assert.equal(chat.bootId, boot);
  assert.deepEqual(
    chat.turns.map((t) => [t.runId, t.state, t.message]),
    [
      [id(1), "succeeded", "first"],
      [id(2), "running", "second"],
    ],
  );
  assert.equal(chat.turns[0].reply, "one");
  assert.equal(chat.turns[1].startedAt, Date.parse("2026-10-06T08:31:00Z"));
  assert.deepEqual(last.effects, [{ kind: "poll", runId: id(2), delay: 0 }]);
  assert.equal(chat.notice, "");
});

test("restoring with an unacknowledged turn the host lacks resumes the identical POST", () => {
  const pending = {
    runId: id(3),
    bootId: boot,
    message: "dodaj komentarz",
    context,
  };
  const { chat, last } = play(newChat(next), {
    type: "restore",
    stored: { conversationId: conversation, acknowledged: true, pending },
    remote: {
      conversation_id: conversation,
      provider: "claude",
      runs: [final("succeeded", { run_id: id(1) })],
    },
    bootId: rebooted,
    conversationId: next,
    now: 77,
  });
  assert.deepEqual(
    chat.turns.map((t) => [t.runId, t.state]),
    [
      [id(1), "succeeded"],
      [id(3), "sending"],
    ],
  );
  assert.equal(turnOf(chat, 3).resumed, true);
  assert.deepEqual(last.effects, [{ kind: "post", runId: id(3), delay: 0 }]);
  assert.deepEqual(postInput(chat, id(3)), {
    run_id: id(3),
    boot_id: boot,
    conversation_id: conversation,
    message: "dodaj komentarz",
    context,
  });
  assert.equal(
    chat.bootId,
    rebooted,
    "the page's boot ID is the host's, the turn keeps its own",
  );
});

test("restoring with an unacknowledged turn the host already ran does not send it twice", () => {
  const pending = { runId: id(1), bootId: boot, message: "first" };
  const { chat, last } = play(newChat(next), {
    type: "restore",
    stored: { conversationId: conversation, acknowledged: false, pending },
    remote: {
      conversation_id: conversation,
      provider: "claude",
      runs: [run({ run_id: id(1), message: "first" })],
    },
    bootId: boot,
    conversationId: next,
    now: 0,
  });
  assert.equal(chat.turns.length, 1);
  assert.equal(chat.acknowledged, true);
  assert.deepEqual(last.effects, [{ kind: "poll", runId: id(1), delay: 0 }]);
});

test("a conversation the host forgot is replaced and the owner is told once", () => {
  const restoreWith = (stored) =>
    reduce(newChat(next), {
      type: "restore",
      stored,
      remote: "not-found",
      bootId: boot,
      conversationId: next,
      now: 0,
    });
  const gone = restoreWith({
    conversationId: conversation,
    acknowledged: true,
    pending: null,
  });
  assert.equal(gone.chat.conversationId, next);
  assert.deepEqual(gone.chat.turns, []);
  assert.equal(gone.chat.notice, "gone");
  assert.equal(gone.chat.acknowledged, false);
  assert.equal(gone.chat.bootId, boot);
  assert.deepEqual(
    reduce(gone.chat, { type: "dismiss-notice" }).chat.notice,
    "",
  );
  // A conversation the host never acknowledged has nothing to announce.
  const silent = restoreWith({
    conversationId: conversation,
    acknowledged: false,
    pending: null,
  });
  assert.equal(silent.chat.notice, "");
  assert.equal(silent.chat.conversationId, next);
  // Nothing stored is simply a fresh start.
  const fresh = restoreWith(null);
  assert.equal(fresh.chat.notice, "");
  assert.equal(fresh.chat.conversationId, next);
  assert.deepEqual(fresh.effects, []);
});

test("a first message that never reached the host resumes in its own conversation", () => {
  const pending = { runId: id(1), bootId: boot, message: "pierwsza", context };
  const { chat, last } = play(newChat(next), {
    type: "restore",
    stored: { conversationId: conversation, acknowledged: false, pending },
    remote: "not-found",
    bootId: boot,
    conversationId: next,
    now: 5,
  });
  assert.equal(
    chat.conversationId,
    conversation,
    "the turn belongs to this conversation",
  );
  assert.equal(chat.notice, "");
  assert.equal(turnOf(chat).state, "sending");
  assert.deepEqual(last.effects, [{ kind: "post", runId: id(1), delay: 0 }]);
});

test("a follow-up whose conversation vanished is resumed and the loss is mentioned", () => {
  const pending = { runId: id(2), bootId: boot, message: "dalej" };
  const { chat } = play(newChat(next), {
    type: "restore",
    stored: { conversationId: conversation, acknowledged: true, pending },
    remote: "not-found",
    bootId: rebooted,
    conversationId: next,
    now: 5,
  });
  assert.equal(chat.conversationId, conversation);
  assert.equal(chat.notice, "gone");
  assert.equal(turnOf(chat, 2).resumed, true);
});

test("what is stored follows the conversation: only acknowledged or pending state is kept", () => {
  assert.equal(
    storedState(ready()),
    null,
    "an untouched conversation stores nothing",
  );
  const sending = sent();
  assert.deepEqual(storedState(sending), {
    conversationId: conversation,
    acknowledged: false,
    pending: {
      runId: id(1),
      bootId: boot,
      message: "zrobiłem 10 pompek",
      context,
    },
  });
  const uncertain = reduce(
    sending,
    post("post-failed", { failure: failure("unknown") }),
  ).chat;
  assert.equal(storedState(uncertain).pending.runId, id(1));
  const acknowledged = reduce(sending, post("posted", { run: run() })).chat;
  assert.deepEqual(storedState(acknowledged), {
    conversationId: conversation,
    acknowledged: true,
    pending: null,
  });
  // A lost or refused turn is not resumed after a reload.
  const lost = play(
    uncertain,
    post("post-failed", { failure: failure("restarted") }),
  ).chat;
  assert.equal(storedState(lost), null);
  assert.equal(
    storedState(
      play(
        sending,
        post("post-failed", {
          failure: failure("rejected", { code: "AGENT_BUSY" }),
        }),
      ).chat,
    ),
    null,
  );
  // No context means none is stored.
  const bare = reduce(ready(), {
    type: "send",
    runId: id(1),
    message: "hi",
    now: 0,
  }).chat;
  assert.equal(Object.hasOwn(storedState(bare).pending, "context"), false);
});

test("send errors and notices are cleared by the next send or by dismissal", () => {
  const refused = play(
    sent(),
    post("post-failed", {
      failure: failure("rejected", { code: "AGENT_BUSY" }),
    }),
  ).chat;
  assert.equal(refused.sendError, "AGENT_BUSY");
  assert.equal(reduce(refused, { type: "dismiss-error" }).chat.sendError, "");
  assert.equal(reduce(refused, send(id(2))).chat.sendError, "");
});

test("elapsed time reads as minutes and two-digit seconds", () => {
  for (const [ms, text] of [
    [-5, "0:00"],
    [0, "0:00"],
    [999, "0:00"],
    [7_000, "0:07"],
    [65_000, "1:05"],
    [600_000, "10:00"],
    [3_725_000, "62:05"],
  ])
    assert.equal(formatElapsed(ms), text, String(ms));
});

test("events never mutate the conversation they were given", () => {
  const before = running();
  const snapshot = JSON.stringify(before);
  for (const event of [
    post("polled", { run: final("succeeded") }),
    post("cancel"),
    post("poll-failed", { failure: failure("unreachable") }),
    { type: "session-ended" },
    { type: "wake", now: 1 },
    { type: "new-conversation", conversationId: next },
  ])
    reduce(before, event);
  assert.equal(JSON.stringify(before), snapshot);
});
