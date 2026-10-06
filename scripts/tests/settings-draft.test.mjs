import test from "node:test";
import assert from "node:assert/strict";
import {
  rebaseSettingsDraft,
  settingsDraft,
} from "../../apps/web/src/features/settings/settings-draft.ts";

const saved = (timezone, preferences = {}) => ({
  timezone,
  locale: "pl",
  preferences,
  version: "r1.test",
});

test("saved preferences map to explicit form values", () => {
  assert.deepEqual(settingsDraft(saved("UTC")), {
    timezone: "UTC",
    week: "monday",
    view: "focus",
    agent: "claude",
  });
  assert.deepEqual(
    settingsDraft(
      saved("Europe/Warsaw", {
        week_start: "sunday",
        default_view: "list",
        agent_provider: "codex",
      }),
    ),
    { timezone: "Europe/Warsaw", week: "sunday", view: "list", agent: "codex" },
  );
});

test("a conflicting draft keeps deliberate edits and follows other saved changes", () => {
  const opened = {
    timezone: "UTC",
    week: "monday",
    view: "focus",
    agent: "claude",
  };
  const current = {
    timezone: "UTC",
    week: "sunday",
    view: "focus",
    agent: "claude",
  };
  const mine = {
    timezone: "Europe/Warsaw",
    week: "monday",
    view: "focus",
    agent: "claude",
  };
  assert.deepEqual(rebaseSettingsDraft(opened, current, mine), {
    // Saving this draft again must not put the week back to Monday.
    draft: {
      timezone: "Europe/Warsaw",
      week: "sunday",
      view: "focus",
      agent: "claude",
    },
    kept: ["timezone"],
  });
});

test("an edit of the same field stays visible instead of being overwritten", () => {
  const opened = {
    timezone: "UTC",
    week: "monday",
    view: "focus",
    agent: "claude",
  };
  const current = {
    timezone: "Asia/Tokyo",
    week: "monday",
    view: "board",
    agent: "claude",
  };
  const mine = {
    timezone: "Europe/Warsaw",
    week: "monday",
    view: "list",
    agent: "claude",
  };
  assert.deepEqual(rebaseSettingsDraft(opened, current, mine), {
    draft: {
      timezone: "Europe/Warsaw",
      week: "monday",
      view: "list",
      agent: "claude",
    },
    kept: ["timezone", "view"],
  });
});

test("an edit that already matches the saved state leaves nothing to save", () => {
  const opened = {
    timezone: "UTC",
    week: "monday",
    view: "focus",
    agent: "claude",
  };
  const current = {
    timezone: "Europe/Warsaw",
    week: "monday",
    view: "focus",
    agent: "claude",
  };
  const mine = {
    timezone: "Europe/Warsaw",
    week: "monday",
    view: "focus",
    agent: "claude",
  };
  assert.deepEqual(rebaseSettingsDraft(opened, current, mine), {
    draft: current,
    kept: [],
  });
});

test("the agent provider defaults to claude and follows the same rebase rules", () => {
  assert.equal(settingsDraft(saved("UTC")).agent, "claude");
  assert.equal(
    settingsDraft(saved("UTC", { agent_provider: "codex" })).agent,
    "codex",
  );
  const base = {
    timezone: "UTC",
    week: "monday",
    view: "focus",
    agent: "claude",
  };
  // An untouched provider follows a change made elsewhere ...
  assert.deepEqual(
    rebaseSettingsDraft(
      base,
      { ...base, agent: "codex" },
      { ...base, week: "sunday" },
    ),
    {
      draft: { ...base, week: "sunday", agent: "codex" },
      kept: ["week"],
    },
  );
  // ... and a deliberate choice stays visible until saved again.
  assert.deepEqual(
    rebaseSettingsDraft(
      base,
      { ...base, week: "sunday" },
      { ...base, agent: "codex" },
    ),
    {
      draft: { ...base, week: "sunday", agent: "codex" },
      kept: ["agent"],
    },
  );
});
