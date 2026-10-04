import {
  api,
  command,
  resourcePath,
  type Resource,
  type Summary,
  type ReadOptions,
} from "./api.ts";
import type {
  CardPatch,
  FocusReplace,
  HistoryPage,
  PreferencesResource,
  ReceiptsInput,
  ProjectDeletionPlan,
} from "../contracts/api.generated";

type Reference<K extends Resource["type"] = Resource["type"]> = Pick<
  Summary,
  "project_id" | "id"
> & { type: K };
export function getResource<K extends Resource["type"]>(
  ref: Reference<K>,
  signal?: AbortSignal,
  options: Pick<ReadOptions, "immediate"> = {},
) {
  return api<Extract<Resource, { type: K }>>(
    resourcePath(ref),
    "GET",
    undefined,
    {},
    { ...options, signal },
  );
}
export function getProject(
  project: string,
  options: Pick<ReadOptions, "immediate" | "signal"> = {},
) {
  return getResource(
    { type: "project", project_id: project, id: project },
    options.signal,
    options,
  );
}
export function getProjectDeletionPlan(project: string) {
  return api<ProjectDeletionPlan>(`/api/v1/projects/${project}/deletion-plan`);
}
export function deleteProject(project: string, version: string) {
  return command(`/api/v1/projects/${project}`, "DELETE", {}, version);
}
export function getPreferences(options: ReadOptions = {}) {
  return api<PreferencesResource>(
    "/api/v1/workspace/preferences",
    "GET",
    undefined,
    {},
    options,
  );
}
export function getHistory(ref: Reference, cursor?: string | null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<HistoryPage>(`${resourcePath(ref)}/history${query}`);
}
export function replaceFocus(payload: FocusReplace, version: string) {
  return command("/api/v1/workspace/focus", "PUT", payload, version);
}
export function markRead(payload: ReceiptsInput) {
  return command("/api/v1/workspace/read-receipts", "POST", payload);
}
export function patchCard(
  project: string,
  id: string,
  payload: CardPatch,
  version: string,
) {
  return command(
    resourcePath({ type: "card", project_id: project, id }),
    "PATCH",
    payload,
    version,
  );
}
export function deleteCard(project: string, id: string, version: string) {
  return command(
    resourcePath({ type: "card", project_id: project, id }),
    "DELETE",
    {},
    version,
  );
}
