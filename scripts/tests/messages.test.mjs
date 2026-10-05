import test from "node:test";
import assert from "node:assert/strict";
import {
  commonMessages,
  loadMessages,
  serverMessage,
} from "../../apps/web/src/lib/api/messages.ts";
import { messages } from "../../apps/web/src/lib/api/message-catalog.ts";

test("messages available before the catalog loads are the catalog's own wording", async () => {
  const early = Object.keys(commonMessages);
  assert(early.length > 0, "the initial bundle keeps its frequent messages");
  const before = early.map((code) => serverMessage(code));
  for (const [index, code] of early.entries()) {
    assert.equal(before[index], commonMessages[code], code);
    // The copy exists only to stay out of the deferred chunk; it must not drift.
    assert.equal(commonMessages[code], messages[code], code);
  }
  await loadMessages();
  assert.deepEqual(
    early.map((code) => serverMessage(code)),
    before,
  );
});

test("the catalog adds detail without changing a code's fallback meaning", async () => {
  await loadMessages();
  for (const [code, text] of Object.entries(messages))
    assert.equal(serverMessage(code), text, code);
  assert.match(serverMessage("FUTURE_ERROR"), /FUTURE_ERROR/);
});
