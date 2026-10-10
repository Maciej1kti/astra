import type {
  AgentProvider,
  PreferencesResource,
} from "../../lib/contracts/api.generated";
import { pluginIds, pluginList } from "../../lib/plugins/registry.ts";

export type SettingsDraft = {
  timezone: string;
  week: string;
  view: string;
  agent: AgentProvider;
  /** Enabled plugin identifiers in their one stable spelling. */
  plugins: string;
  /** Approved root of new project folders; empty while none is selected. */
  root: string;
  /** New projects get a private repository on a host that publishes. */
  publish: boolean;
};
const fields = [
  "timezone",
  "week",
  "view",
  "agent",
  "plugins",
  "root",
  "publish",
] as const;

export function settingsDraft(saved: PreferencesResource): SettingsDraft {
  return {
    timezone: saved.timezone,
    week: saved.preferences.week_start ?? "monday",
    view: saved.preferences.default_view ?? "focus",
    agent: saved.preferences.agent_provider ?? "claude",
    plugins: pluginList(saved.preferences.plugins),
    root: saved.preferences.project_root_id ?? "",
    publish: saved.preferences.publish_repositories ?? true,
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

/** What this host offers: a field it does not show is never sent. */
export type SettingsScope = { agent: boolean; github: boolean };

export type SettingsPayload = {
  timezone: string;
  locale: "pl";
  preferences: PreferencesResource["preferences"];
};

/** The PATCH body of a draft, against the settings it was last saved as. */
export function settingsPayload(
  saved: PreferencesResource,
  draft: SettingsDraft,
  scope: SettingsScope,
): SettingsPayload {
  return {
    timezone: draft.timezone,
    locale: "pl",
    preferences: {
      week_start: draft.week as "monday" | "sunday",
      default_view: draft.view as never,
      ...(scope.agent ? { agent_provider: draft.agent } : {}),
      plugins: pluginIds(draft.plugins),
      // A folder choice can be changed but not cleared.
      ...(draft.root && draft.root !== saved.preferences.project_root_id
        ? { project_root_id: draft.root }
        : {}),
      ...(scope.github ? { publish_repositories: draft.publish } : {}),
    },
  };
}

/**
 * The settings after the server acknowledged `payload` as `version`. The reply
 * names only the version, and reading the settings again could bring in someone
 * else's later change, which the next save would then overwrite unseen. The
 * next save is therefore conditional on exactly this version.
 */
export function acknowledgedSettings(
  saved: PreferencesResource,
  payload: SettingsPayload,
  version: string,
): PreferencesResource {
  return {
    ...saved,
    timezone: payload.timezone,
    locale: payload.locale,
    preferences: { ...saved.preferences, ...payload.preferences },
    version,
  };
}

/** Two drafts with one snapshot would be saved as the same command. */
export function settingsSnapshot(
  saved: PreferencesResource,
  draft: SettingsDraft,
  scope: SettingsScope,
) {
  return JSON.stringify(settingsPayload(saved, draft, scope));
}
