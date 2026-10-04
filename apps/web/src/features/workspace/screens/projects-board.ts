import type { Summary } from "../../../lib/api/api";
import type { WorkspaceRoute } from "../navigation";

export const projectStates = ["active", "paused", "archived"] as const;
export type ProjectState = (typeof projectStates)[number];
export const projectStateLabels: Record<ProjectState, string> = {
  active: "Aktywne",
  paused: "Wstrzymane",
  archived: "Zarchiwizowane",
};

export function projectState(item: Pick<Summary, "status">) {
  return projectStates.includes(item.status as ProjectState)
    ? (item.status as ProjectState)
    : null;
}

/** The workspace board retains archived and unavailable projects in its scope. */
export function visibleProjects(
  projects: Summary[],
  route: Pick<WorkspaceRoute, "folder" | "search">,
) {
  const search = route.search.trim().toLowerCase();
  return projects.filter(
    (item) =>
      (!route.folder || item.folder === route.folder) &&
      item.title.toLowerCase().includes(search),
  );
}

export function canMoveProject(item: Summary) {
  return (
    !!projectState(item) &&
    !!item.version &&
    (!item.availability || item.availability === "ready")
  );
}

/** A changed source cancels a gesture; it never supplies a replacement version. */
export function currentProjectSnapshot(
  observed: Summary,
  current: readonly Summary[],
) {
  const item = current.find((candidate) => candidate.id === observed.id);
  return (
    !!item &&
    canMoveProject(item) &&
    item.version === observed.version &&
    item.status === observed.status
  );
}
