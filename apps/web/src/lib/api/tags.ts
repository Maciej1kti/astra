import { api, command, type ReadOptions } from "./api.ts";
import type {
  TagCatalog,
  TagPreview,
  TagPreviewRequest,
  TagsReplace,
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
