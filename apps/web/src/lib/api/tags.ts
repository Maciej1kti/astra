import { api, command, type ReadOptions } from "./api.ts";
import type {
  TagCatalog,
  TagPreviewRequest,
  ProjectTagRenamePlan,
} from "../contracts/api.generated";

export function getProjectTags(
  project: string,
  options: Pick<ReadOptions, "immediate" | "signal"> = {},
) {
  return api<TagCatalog>(
    `/api/v1/projects/${project}/tags`,
    "GET",
    undefined,
    {},
    { ...options, fresh: true },
  );
}
export function planProjectTagRename(
  project: string,
  input: TagPreviewRequest,
) {
  return api<ProjectTagRenamePlan>(
    `/api/v1/projects/${project}/tags/preview`,
    "POST",
    input,
  );
}
export function applyProjectTagRename(project: string, planId: string) {
  return command(`/api/v1/projects/${project}/tags/rename`, "POST", {
    plan_id: planId,
  });
}
