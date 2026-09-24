import { api, command, type ReadOptions } from "./api.ts";
import type {
  TagCatalog,
  TagPreview,
  TagPreviewRequest,
  TagsReplace,
  ProjectTagRenamePlan,
} from "../contracts/api.generated";

export function getTagCatalog(options: ReadOptions = { fresh: true }) {
  return api<TagCatalog>(
    "/api/v1/workspace/tags",
    "GET",
    undefined,
    {},
    options,
  );
}
export function previewTagChange(input: TagPreviewRequest) {
  return api<TagPreview>("/api/v1/workspace/tags/preview", "POST", input);
}
export function replaceTags(input: TagsReplace, version: string) {
  return command("/api/v1/workspace/tags", "PUT", input, version);
}

export function getProjectTags(project: string) {
  return api<TagCatalog>(
    `/api/v1/projects/${project}/tags`,
    "GET",
    undefined,
    {},
    { fresh: true },
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
