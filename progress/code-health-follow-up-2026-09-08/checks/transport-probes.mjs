/** Analysis-only contract probe against an ordinary temporary Unix daemon. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHost } from "../../../scripts/browser/host.mjs";

const host = await createHost();
try {
  const plan = host.cli("registration-plan", host.folder, "--name", "Synthetic contract audit");
  host.cli("register", plan.plan_id);
  const payload = join(host.temp, "card.json");
  await writeFile(payload, JSON.stringify({ title: "Epoch probe" }), { mode: 0o600 });
  const reply = host.cli("command", "POST", `/api/v1/projects/${plan.project_id}/cards`, "--json-file", payload);
  const actualEpoch = host.cli("hello").command_epoch;
  const differentEpoch = randomUUID();
  assert.notEqual(actualEpoch, differentEpoch);
  const base = `/api/v1/commands/${reply.request_id}`;
  const omitted = host.cli("get", base);
  const matching = host.cli("get", `${base}?epoch=${actualEpoch}`);
  const different = host.cli("get", `${base}?epoch=${differentEpoch}`);
  const malformed = host.cli("get", `${base}?epoch=not-a-uuid`);
  for (const value of [omitted, matching, different, malformed]) assert.equal(value.state, "committed");
  console.log(JSON.stringify({ commandStatusEpoch: {
    missing: omitted.state, matching: matching.state, different: different.state, malformed: malformed.state,
    conclusion: "The required OpenAPI epoch query parameter is ignored by the handler. All reads use the current journal epoch.",
  }, limitations: "Real release daemon and Unix CLI; synthetic project only. No historical epoch restoration or browser status UI was exercised." }, null, 2));
} finally { await host.close(); }
