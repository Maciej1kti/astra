import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../../apps/web/src/lib/api/api.ts";
import { CommandController } from "../../apps/web/src/lib/api/command-controller.ts";
import { errorMessage } from "../../apps/web/src/lib/api/messages.ts";
import {
  InvalidResponseError,
  TransportError,
} from "../../apps/web/src/lib/api/transport-errors.ts";

const ended = [];
globalThis.window = new EventTarget();
window.addEventListener("session-ended", () => ended.push(Date.now()));

function bootstrap() {
  api.configure({
    csrf_token: "csrf",
    command_epoch: "epoch",
    server_time: new Date().toISOString(),
  });
}
async function withFetch(reply, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = reply;
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
}
const html =
  (status, failure = new SyntaxError("Unexpected token '<'")) =>
  async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      throw failure;
    },
  });
// WebKit reports unparsable JSON as a DOMException, not as a SyntaxError.
const webkitParseFailure = new DOMException(
  "The string did not match the expected pattern.",
  "SyntaxError",
);

test("a 401 ends only a session that existed, and only once", async () => {
  const unauthorized = async () => ({
    status: 401,
    ok: false,
    json: async () => ({
      api_version: "1",
      error: { code: "SESSION_REQUIRED", message: "Pair this browser" },
    }),
  });
  await withFetch(unauthorized, async () => {
    await assert.rejects(api.api("/api/v1/bootstrap", "POST", {}), {
      status: 401,
    });
    assert.equal(ended.length, 0, "A never-paired browser has no session");
    bootstrap();
    await assert.rejects(api.api("/api/v1/x", "POST", {}), { status: 401 });
    assert.equal(ended.length, 1);
    await assert.rejects(api.api("/api/v1/x", "POST", {}), { status: 401 });
    assert.equal(ended.length, 1, "The same loss is reported once");
    bootstrap();
    api.closeSession();
    await assert.rejects(api.api("/api/v1/x", "POST", {}), { status: 401 });
    assert.equal(ended.length, 1, "A deliberate sign-out is not a loss");
  });
  bootstrap();
  await withFetch(html(401), async () => {
    await assert.rejects(
      api.api("/api/v1/x", "POST", {}),
      InvalidResponseError,
    );
    assert.equal(ended.length, 2, "The status ends the session, not its body");
  });
});

test("a gateway page is an invalid response and leaves the command uncertain", async () => {
  bootstrap();
  const pending = api.command("/api/v1/projects/p/cards", "POST", {
    title: "Draft",
  });
  const operation = new CommandController();
  operation.prepare(pending);
  await withFetch(html(502), async () => {
    const failure = await operation.retry().then(
      () => assert.fail("An HTML reply cannot confirm a command"),
      (cause) => cause,
    );
    assert(failure instanceof InvalidResponseError);
    assert.equal(failure.status, 502);
    assert.equal(api.isDefinitiveRejection(failure), false);
    assert.match(errorMessage(failure), /nieprawidłową odpowiedź \(502\)/);
    assert.doesNotMatch(errorMessage(failure), /JSON|Unexpected/);
  });
  assert.equal(operation.state.phase, "uncertain");
  assert.equal(operation.pending, pending);
  // A proxy can answer a definitive-looking status with its own error page.
  await withFetch(html(413), async () => {
    await assert.rejects(operation.retry(), InvalidResponseError);
  });
  assert.equal(operation.pending, pending);
  await withFetch(html(502, webkitParseFailure), async () => {
    const failure = await operation.retry().then(assert.fail, (cause) => cause);
    assert(failure instanceof InvalidResponseError);
    assert.doesNotMatch(errorMessage(failure), /expected pattern/);
  });
  assert.equal(operation.pending, pending);
  await withFetch(
    async () => ({ status: 500, ok: false, json: async () => null }),
    async () => {
      await assert.rejects(operation.retry(), InvalidResponseError);
    },
  );
  assert.equal(operation.pending, pending);
});

test("a failed exchange is a transport error at any point of the reply", async () => {
  bootstrap();
  const pending = api.command("/api/v1/projects/p/cards", "POST", {
    title: "Draft",
  });
  const operation = new CommandController();
  operation.prepare(pending);
  for (const reply of [
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async () => ({
      status: 200,
      ok: true,
      json: async () => {
        throw new TypeError("Body stream interrupted");
      },
    }),
  ])
    await withFetch(reply, async () => {
      const failure = await operation.retry().then(
        () => assert.fail("A lost reply cannot confirm a command"),
        (cause) => cause,
      );
      assert(failure instanceof TransportError);
      assert.equal(api.isDefinitiveRejection(failure), false);
      assert.match(errorMessage(failure), /połączyć z serwerem/);
      assert.equal(operation.state.phase, "uncertain");
      assert.equal(operation.pending, pending);
    });
});

test("a timed-out mutation is reported as interrupted, not as a bad reply", async (t) => {
  bootstrap();
  const pending = api.command("/api/v1/projects/p/cards", "POST", {
    title: "Draft",
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  // The reply headers arrived; its body is still streaming at the deadline.
  await withFetch(
    async (_path, { signal }) => ({
      status: 200,
      ok: true,
      json: () =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason)),
        ),
    }),
    async () => {
      const outcome = api.send(pending).then(assert.fail, (cause) => cause);
      await new Promise((done) => setImmediate(done));
      t.mock.timers.tick(15_000);
      const failure = await outcome;
      assert.equal(failure.name, "AbortError");
      assert.match(errorMessage(failure), /Operacja została przerwana/);
      assert.equal(api.isDefinitiveRejection(failure), false);
    },
  );
});

test("local mistakes are not presented as server or connection failures", () => {
  assert.match(
    errorMessage(new SyntaxError("Unexpected token")),
    /Nieprawidłowe dane JSON/,
  );
  const fault = errorMessage(new TypeError("x.y is not a function"));
  assert.doesNotMatch(fault, /połączyć z serwerem|not a function/);
  assert.match(fault, /Operacja nie powiodła się/);
});
