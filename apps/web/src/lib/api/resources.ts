import {
  api,
  command,
  resourcePath,
  type Resource,
  type Summary,
} from "./api.ts";
import type {
  CardPatch,
  FocusReplace,
  FocusResource,
  HistoryPage,
  PreferencesResource,
  ReceiptsInput,
  UpdateCreate,
} from "../contracts/api.generated";

type Reference<K extends Resource["type"] = Resource["type"]> = Pick<
  Summary,
  "project_id" | "id"
> & { type: K };
export function getResource<K extends Resource["type"]>(
  ref: Reference<K>,
  signal?: AbortSignal,
) {
  return api<Extract<Resource, { type: K }>>(
    resourcePath(ref),
    "GET",
    undefined,
    {},
    { signal },
  );
}
export function getProject(project: string) {
  return getResource({ type: "project", project_id: project, id: project });
}
export function getFocus() {
  return api<FocusResource>("/api/v1/workspace/focus");
}
export function getPreferences() {
  return api<PreferencesResource>("/api/v1/workspace/preferences");
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
export function createUpdate(project: string, payload: UpdateCreate) {
  return command(`/api/v1/projects/${project}/updates`, "POST", payload);
}
