import type {
  AgentProvider,
  PreferencesResource,
} from "../../lib/contracts/api.generated";

export type SettingsDraft = {
  timezone: string;
  week: string;
  view: string;
  agent: AgentProvider;
};
const fields = ["timezone", "week", "view", "agent"] as const;

export function settingsDraft(saved: PreferencesResource): SettingsDraft {
  return {
    timezone: saved.timezone,
    week: saved.preferences.week_start ?? "monday",
    view: saved.preferences.default_view ?? "focus",
    agent: saved.preferences.agent_provider ?? "claude",
  };
}

/**
 * Move a rejected draft onto the current saved settings. Fields the user
 * edited keep their value so they can be saved again deliberately; untouched
 * fields follow the saved state, so that save cannot revert another change.
 */
export function rebaseSettingsDraft(
  opened: SettingsDraft,
  current: SettingsDraft,
  draft: SettingsDraft,
) {
  const rebased: SettingsDraft = { ...current };
  for (const field of fields)
    if (draft[field] !== opened[field])
      Object.assign(rebased, { [field]: draft[field] });
  return {
    draft: rebased,
    kept: fields.filter((field) => rebased[field] !== current[field]),
  };
}
