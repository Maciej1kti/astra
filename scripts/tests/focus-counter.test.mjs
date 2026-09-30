import test from "node:test";
import assert from "node:assert/strict";
import {
  FocusCounterController,
  clampCounter,
} from "../../apps/web/src/features/cards/focus-counter-controller.ts";
import { CommandController } from "../../apps/web/src/lib/api/command-controller.ts";
import { ApiError } from "../../apps/web/src/lib/api/api.ts";
const item = {
  id: "card",
  project_id: "project",
  title: "Exercise",
  version: "observed",
  availability: "ready",
};
const counter = {
  id: "counter",
  name: "Push-ups",
  unit: "reps",
  step: 5,
  date: "2026-09-30",
  value: 10,
};
function setup(send) {
  let allowed = true;
  const commands = [],
    saved = [];
  const controller = new FocusCounterController({
    changed() {},
    allowed: () => allowed,
    saved: (...args) => saved.push(args),
    command: new CommandController({
      send: async (pending) => {
        commands.push(pending);
        return send(pending);
      },
    }),
    prepare: (project, card, payload, version) =>
      Object.freeze({
        path: `${project}/${card}`,
        method: "PATCH",
        payload,
        version,
        epoch: "epoch",
        requestId: "request",
      }),
  });
  return {
    controller,
    commands,
    saved,
    disconnect: () => {
      allowed = false;
    },
  };
}
const committed = {
  kind: "committed",
  reply: { result: { resource: { type: "card", version: "saved" } } },
};
test("Focus totals are local until confirmation and keep the observed day/version through refresh and midnight", async () => {
  const { controller, commands } = setup(() => committed);
  controller.edit(item, counter, 15);
  controller.edit(
    { ...item, version: "new" },
    { ...counter, date: "2026-10-01", value: 0 },
    20,
  );
  assert.equal(commands.length, 0);
  assert.equal(controller.snapshot.draft.counter.date, counter.date);
  controller.setValue(-1);
  controller.setValue(1.5);
  assert.equal(controller.snapshot.draft.value, 20);
  await controller.save();
  assert.equal(commands[0].version, "observed");
  assert.deepEqual(commands[0].payload, {
    record_counter: { id: "counter", date: "2026-09-30", value: 20 },
  });
  assert.equal(controller.snapshot.draft, null);
  assert.equal(clampCounter(1e9 + 100), 1e9);
  assert.equal(clampCounter(-5), 0);
});
test("uncertain Focus counter saves retain the exact command and cannot be discarded or replaced", async () => {
  let attempts = 0;
  const { controller, commands } = setup(() => {
    if (!attempts++) throw new TypeError("Lost reply");
    return committed;
  });
  controller.edit(item, counter, 15);
  await controller.save();
  const pending = controller.snapshot.pending;
  controller.dismiss();
  controller.edit({ ...item, id: "another" }, counter, 100);
  controller.setValue(200);
  assert.equal(controller.snapshot.pending, pending);
  assert.equal(controller.snapshot.draft.value, 15);
  await controller.resolve(false);
  assert.equal(commands.length, 2);
  assert.equal(commands[0], commands[1]);
  assert.equal(controller.snapshot.draft, null);
});
test("conflicts preserve the proposal and require explicit discard before editing a fresh observation", async () => {
  const { controller, commands } = setup(() => {
    throw new ApiError(412, { error: { code: "VERSION_CONFLICT" } });
  });
  controller.edit(item, counter, 15);
  await controller.save();
  assert.equal(controller.snapshot.rejected, true);
  controller.edit({ ...item, version: "new" }, counter, 30);
  await controller.save();
  assert.equal(commands.length, 1);
  assert.equal(controller.snapshot.draft.value, 15);
  controller.dismiss();
  controller.edit({ ...item, version: "new" }, counter, 30);
  assert.equal(controller.snapshot.draft.version, "new");
});
test("session loss retains a local draft and makes no write; unverified sources cannot start drafts", async () => {
  const { controller, commands, disconnect } = setup(() => committed);
  controller.edit({ ...item, availability: "stale" }, counter, 20);
  assert.equal(controller.snapshot.draft, null);
  controller.edit({ ...item, archived: true }, counter, 20);
  disconnect();
  await controller.save();
  assert.equal(commands.length, 0);
  assert.equal(controller.snapshot.draft.value, 20);
});
