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

test("agent protocol codes translate to their exact Polish wording", async () => {
  const agent = {
    AGENT_DISABLED: "Agent nie jest włączony na tym hoście.",
    AGENT_HOST_RESTARTED: "Host został uruchomiony ponownie.",
    AGENT_RUN_NOT_FOUND: "Host nie zna tej wiadomości.",
    AGENT_CONVERSATION_NOT_FOUND: "Host nie zna tej rozmowy.",
    AGENT_RUN_ID_REUSED: "Ten identyfikator wiadomości został już użyty.",
    AGENT_RUN_ACTIVE: "Agent jeszcze pracuje nad poprzednią wiadomością.",
    AGENT_BUSY: "Agent jest zajęty innymi zadaniami. Spróbuj za chwilę.",
    AGENT_PROVIDER_UNAVAILABLE:
      "Na hoście nie udało się uruchomić wybranego dostawcy agenta.",
    AGENT_CLI_UNAVAILABLE:
      "Na hoście brakuje polecenia projectctl obok demona.",
    AGENT_INSTRUCTIONS_MISSING: "W katalogu agenta brakuje pliku AGENTS.md.",
    AGENT_PROVIDER_FAILED: "Dostawca agenta zgłosił błąd.",
    AGENT_OUTPUT_INVALID: "Agent zakończył pracę bez odpowiedzi.",
  };
  await loadMessages();
  for (const [code, text] of Object.entries(agent)) {
    assert.equal(messages[code], text, code);
    assert.equal(serverMessage(code), text, code);
  }
  // Rare codes live only in the deferred catalog, not in the initial bundle.
  for (const code of Object.keys(agent))
    assert(
      !(code in commonMessages),
      `${code} must not enlarge the initial bundle`,
    );
});
