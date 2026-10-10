import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgedSettings,
  settingsDraft,
  settingsPayload,
  settingsSnapshot,
} from "../../apps/web/src/features/settings/settings-draft.ts";
import {
  settingsAutosave,
  settingsSaveLabel,
} from "../../apps/web/src/features/settings/settings-autosave.ts";
import { ApiError } from "../../apps/web/src/lib/api/api.ts";

const ROOT = "ae0c14a1-72e7-4b4d-af85-613767a87a8e";
const OTHER_ROOT = "be0c14a1-72e7-4b4d-af85-613767a87a8e";
const saved = (version = "r1.loaded", preferences = {}, timezone = "UTC") => ({
  timezone,
  locale: "pl",
  preferences,
  version,
});
const everything = { agent: true, github: true };
const plain = { agent: false, github: false };

test("the payload carries only what this host and draft can save", () => {
  const loaded = saved("r1.loaded", { project_root_id: ROOT });
  const draft = { ...settingsDraft(loaded), week: "sunday", agent: "codex" };
  assert.deepEqual(settingsPayload(loaded, draft, plain), {
    timezone: "UTC",
    locale: "pl",
    preferences: { week_start: "sunday", default_view: "focus", plugins: [] },
  });
  assert.deepEqual(
    settingsPayload(
      loaded,
      { ...draft, root: OTHER_ROOT, publish: false },
      everything,
    ).preferences,
    {
      week_start: "sunday",
      default_view: "focus",
      agent_provider: "codex",
      plugins: [],
      project_root_id: OTHER_ROOT,
      publish_repositories: false,
    },
  );
});

test("an acknowledged save becomes the settings the next save is based on", () => {
  const loaded = saved("r1.loaded", {
    navigation: ["focus"],
    week_start: "monday",
  });
  const draft = {
    ...settingsDraft(loaded),
    week: "sunday",
    timezone: "Europe/Warsaw",
  };
  const next = acknowledgedSettings(
    loaded,
    settingsPayload(loaded, draft, plain),
    "r1.acknowledged",
  );
  assert.equal(next.version, "r1.acknowledged");
  assert.deepEqual(settingsDraft(next), draft);
  assert.deepEqual(
    next.preferences.navigation,
    ["focus"],
    "other preferences stay",
  );
  assert.equal(
    loaded.version,
    "r1.loaded",
    "the loaded settings are not mutated",
  );
});

test("a draft is unsaved only when its payload differs", () => {
  const loaded = saved("r1.loaded", { project_root_id: ROOT });
  const same = settingsDraft(loaded);
  const clean = settingsSnapshot(loaded, same, everything);
  assert.equal(settingsSnapshot(loaded, { ...same }, everything), clean);
  assert.notEqual(
    settingsSnapshot(loaded, { ...same, view: "list" }, everything),
    clean,
  );
  // A cleared folder choice cannot be saved, so it is not a pending change.
  assert.equal(
    settingsSnapshot(loaded, { ...same, root: "" }, everything),
    clean,
  );
  // A field this host does not offer cannot make the draft unsaved.
  assert.equal(
    settingsSnapshot(loaded, { ...same, agent: "codex" }, plain),
    settingsSnapshot(loaded, same, plain),
  );
});

function harness({ reply } = {}) {
  const sent = [];
  let sequence = 0;
  let version = 0;
  const states = [];
  const autosave = settingsAutosave({
    scope: () => plain,
    createPending: (payload, observed) =>
      Object.freeze({
        path: "/api/v1/workspace/preferences",
        method: "PATCH",
        payload: structuredClone(payload),
        version: observed,
        requestId: `request-${++sequence}`,
        epoch: "epoch",
      }),
    onchange: (state) => states.push(state.phase),
    send: async (pending) => {
      sent.push(pending);
      if (reply) return reply(pending, sent.length);
      return {
        kind: "committed",
        reply: {
          status: "committed",
          request_id: pending.requestId,
          result: { type: "preferences", version: `r1.saved-${++version}` },
          warnings: [],
        },
      };
    },
  });
  return { autosave, sent, states };
}
const change = (autosave, loaded, fields) => {
  const draft = { ...settingsDraft(autosave.source ?? loaded), ...fields };
  return autosave.enqueue(
    draft,
    settingsSnapshot(autosave.source ?? loaded, draft, plain),
  );
};

test("each change is one conditional command on the last acknowledged version", async () => {
  const loaded = saved("r1.loaded");
  const { autosave, sent, states } = harness();
  autosave.reset(loaded);

  await change(autosave, loaded, { week: "sunday" });
  await change(autosave, loaded, { view: "list" });

  assert.deepEqual(
    sent.map((pending) => [pending.method, pending.path, pending.version]),
    [
      ["PATCH", "/api/v1/workspace/preferences", "r1.loaded"],
      ["PATCH", "/api/v1/workspace/preferences", "r1.saved-1"],
    ],
  );
  assert.equal(
    sent[1].payload.preferences.week_start,
    "sunday",
    "the earlier change stays",
  );
  assert.equal(sent[1].payload.preferences.default_view, "list");
  assert.equal(autosave.source.version, "r1.saved-2");
  assert.equal(settingsDraft(autosave.source).view, "list");
  assert.equal(states.at(-1), "saved");
  assert.equal(autosave.hasWork, false);
});

test("a conflict stops automatic saving until the settings are read again", async () => {
  const loaded = saved("r1.loaded");
  const conflict = new ApiError(412, { error: { code: "VERSION_CONFLICT" } });
  const { autosave, sent, states } = harness({
    reply: async () => {
      throw conflict;
    },
  });
  autosave.reset(loaded);

  await assert.rejects(change(autosave, loaded, { week: "sunday" }));
  await change(autosave, loaded, { week: "sunday", view: "list" }).catch(
    () => {},
  );

  assert.equal(
    sent.length,
    1,
    "a later edit is not sent over an unresolved failure",
  );
  assert.equal(states.at(-1), "conflict");
  assert.equal(autosave.source.version, "r1.loaded");

  autosave.reset(saved("r1.current", { default_view: "board" }));
  assert.equal(autosave.hasWork, false);
  assert.equal(autosave.state.phase, "idle");
});

test("the header shows one of three states, as the card editor does", () => {
  const label = (input) =>
    settingsSaveLabel({
      loaded: true,
      phase: "idle",
      queued: false,
      dirty: false,
      accessLost: false,
      ...input,
    });
  assert.equal(label({ loaded: false }), "");
  assert.equal(label({}), "Zapisano");
  assert.equal(label({ phase: "saved" }), "Zapisano");
  assert.equal(label({ phase: "submitting" }), "Zapisywanie…");
  assert.equal(label({ phase: "saved", queued: true }), "Zapisywanie…");
  assert.equal(label({ dirty: true }), "Zapisywanie…");
  for (const phase of ["conflict", "uncertain", "not-saved", "rejected"])
    assert.equal(label({ phase, dirty: true }), "Niezapisane", phase);
  assert.equal(label({ accessLost: true, dirty: true }), "Niezapisane");
  assert.equal(
    label({ accessLost: true }),
    "Zapisano",
    "nothing unsaved is at risk",
  );
});
