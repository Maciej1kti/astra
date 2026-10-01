import type { Resource } from "../../lib/api/api.ts";
import { getResource, getProject } from "../../lib/api/resources.ts";
import { getProjectTags } from "../../lib/api/tags.ts";
import type {
  ProjectResource,
  TagCatalog,
} from "../../lib/contracts/api.generated";
import { editTarget, type EditorTarget } from "./editor-target.ts";

export type EditorOpening = {
  takeProject: () => Promise<ProjectResource> | undefined;
  takeTags: () => Promise<TagCatalog> | undefined;
  cancel: () => void;
};

/** Only a successful current source read can transfer these reads to an editor. */
export async function loadEditorTarget(
  reference: { project_id: string; type: Resource["type"]; id: string },
  signal: AbortSignal,
): Promise<EditorTarget> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const tagsController = new AbortController();
  let cleanup: (() => void) | undefined;
  const cancelled = () => {
    controller.abort(signal.reason);
    cleanup?.();
  };
  const cancelTags = () => tagsController.abort(controller.signal.reason);
  signal.addEventListener("abort", cancelled, { once: true });
  controller.signal.addEventListener("abort", cancelTags, { once: true });

  const source = getResource(reference, controller.signal, { immediate: true });
  let project =
    reference.type !== "project"
      ? getProject(reference.project_id, {
          signal: controller.signal,
          immediate: true,
        })
      : undefined;
  let tags =
    reference.type === "card"
      ? getProjectTags(reference.project_id, {
          signal: tagsController.signal,
          immediate: true,
        })
      : undefined;
  void project?.catch(() => {});
  void tags?.catch(() => {});
  const invalidateTags = () => {
    tags = undefined;
    tagsController.abort();
  };
  window.addEventListener("tag-suggestions-changed", invalidateTags);

  const opening: EditorOpening = {
    takeProject() {
      const read = project;
      project = undefined;
      return read;
    },
    takeTags() {
      const read = tags;
      tags = undefined;
      window.removeEventListener("tag-suggestions-changed", invalidateTags);
      return read;
    },
    cancel() {
      signal.removeEventListener("abort", cancelled);
      window.removeEventListener("tag-suggestions-changed", invalidateTags);
      controller.abort();
      controller.signal.removeEventListener("abort", cancelTags);
      cancelTags();
      project = undefined;
      tags = undefined;
    },
  };
  cleanup = opening.cancel;
  if (controller.signal.aborted) opening.cancel();
  try {
    const resource = await source;
    controller.signal.throwIfAborted();
    return editTarget(reference.project_id, resource, opening);
  } catch (error) {
    opening.cancel();
    throw error;
  }
}
