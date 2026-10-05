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
  });
  assert.deepEqual(
    settingsDraft(
      saved("Europe/Warsaw", { week_start: "sunday", default_view: "list" }),
    ),
    { timezone: "Europe/Warsaw", week: "sunday", view: "list" },
  );
});

test("a conflicting draft keeps deliberate edits and follows other saved changes", () => {
  const opened = { timezone: "UTC", week: "monday", view: "focus" };
  const current = { timezone: "UTC", week: "sunday", view: "focus" };
  const mine = { timezone: "Europe/Warsaw", week: "monday", view: "focus" };
  assert.deepEqual(rebaseSettingsDraft(opened, current, mine), {
    // Saving this draft again must not put the week back to Monday.
    draft: { timezone: "Europe/Warsaw", week: "sunday", view: "focus" },
    kept: ["timezone"],
  });
});

test("an edit of the same field stays visible instead of being overwritten", () => {
  const opened = { timezone: "UTC", week: "monday", view: "focus" };
  const current = { timezone: "Asia/Tokyo", week: "monday", view: "board" };
  const mine = { timezone: "Europe/Warsaw", week: "monday", view: "list" };
  assert.deepEqual(rebaseSettingsDraft(opened, current, mine), {
    draft: { timezone: "Europe/Warsaw", week: "monday", view: "list" },
    kept: ["timezone", "view"],
  });
});

test("an edit that already matches the saved state leaves nothing to save", () => {
  const opened = { timezone: "UTC", week: "monday", view: "focus" };
  const current = { timezone: "Europe/Warsaw", week: "monday", view: "focus" };
  const mine = { timezone: "Europe/Warsaw", week: "monday", view: "focus" };
  assert.deepEqual(rebaseSettingsDraft(opened, current, mine), {
    draft: current,
    kept: [],
  });
});
