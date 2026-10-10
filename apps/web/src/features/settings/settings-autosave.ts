import {
  EditorAutosave,
  type AutosavePhase,
} from "../editor/editor-autosave.ts";
import type { CommandReply, Pending } from "../../lib/api/api.ts";
import type {
  CommandStatus,
  PreferencesResource,
} from "../../lib/contracts/api.generated.ts";
import {
  acknowledgedSettings,
  settingsPayload,
  type SettingsDraft,
  type SettingsPayload,
  type SettingsScope,
} from "./settings-draft.ts";

type Options = {
  scope: () => SettingsScope;
  /** A conditional PATCH of the workspace preferences on the given version. */
  createPending: (payload: SettingsPayload, version: string) => Pending;
  allowed?: () => boolean;
  onchange?: (
    state: EditorAutosave<SettingsDraft, PreferencesResource>["state"],
  ) => void;
  oncommitted?: (saved: PreferencesResource) => void;
  send?: (pending: Pending) => Promise<CommandReply>;
  status?: (pending: Pending) => Promise<CommandStatus>;
};

/**
 * Workspace settings saved as the card editor saves a card (ADR-035, ADR-078):
 * one command at a time, each on the version the previous one produced, the
 * newest draft waiting behind a command in flight, and no automatic command
 * after a conflict or an unknown outcome.
 */
export function settingsAutosave(options: Options) {
  // The reply names the new version only, so each command's payload is kept
  // until it is acknowledged.
  const sent = new Map<string, SettingsPayload>();
  const autosave: EditorAutosave<SettingsDraft, PreferencesResource> =
    new EditorAutosave<SettingsDraft, PreferencesResource>({
      source: null,
      buildPayload: (saved, draft) => {
        if (!saved) throw new Error("Ustawienia nie zostały jeszcze wczytane.");
        return settingsPayload(saved, draft, options.scope());
      },
      createPending: (saved, payload) => {
        const pending = options.createPending(
          payload as SettingsPayload,
          saved!.version,
        );
        sent.set(pending.requestId, payload as SettingsPayload);
        return pending;
      },
      resourceFromReply: (reply) => {
        const payload = sent.get(reply.request_id);
        const version = reply.result.version;
        if (!payload || !version || !autosave.source)
          throw new Error("Odpowiedź nie potwierdza zapisanych ustawień.");
        sent.delete(reply.request_id);
        return acknowledgedSettings(autosave.source, payload, version);
      },
      oncommitted: (saved) => options.oncommitted?.(saved),
      onchange: options.onchange,
      allowed: options.allowed,
      send: options.send,
      status: options.status,
    });
  return autosave;
}

/** The header's save state, in the card editor's three words. */
export function settingsSaveLabel(input: {
  loaded: boolean;
  phase: AutosavePhase;
  queued: boolean;
  dirty: boolean;
  accessLost: boolean;
}): "" | "Zapisano" | "Zapisywanie…" | "Niezapisane" {
  if (!input.loaded) return "";
  const stopped = ["conflict", "uncertain", "not-saved", "rejected"].includes(
    input.phase,
  );
  const unsaved =
    input.dirty ||
    input.queued ||
    input.phase === "submitting" ||
    input.phase === "checking";
  if (stopped || (input.accessLost && unsaved)) return "Niezapisane";
  return unsaved ? "Zapisywanie…" : "Zapisano";
}
