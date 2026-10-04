import type { Summary } from "../../../lib/api/api";
import type { WorkspaceRoute } from "../navigation";

export const mainProjectStates = ["active", "paused", "archived"] as const;
export type MainProjectState = (typeof mainProjectStates)[number];
export const mainProjectStateLabels: Record<MainProjectState, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export function mainProjectState(item: Pick<Summary, "status">) {
  return mainProjectStates.includes(item.status as MainProjectState)
    ? (item.status as MainProjectState)
    : null;
}

/** The workspace board retains archived and unavailable projects in its scope. */
export function visibleMainProjects(
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

export function canMoveMainProject(item: Summary) {
  return (
    !!mainProjectState(item) &&
    !!item.version &&
    (!item.availability || item.availability === "ready")
  );
}

/** A changed source cancels a gesture; it never supplies a replacement version. */
export function currentMainProjectSnapshot(
  observed: Summary,
  current: readonly Summary[],
) {
  const item = current.find((candidate) => candidate.id === observed.id);
  return (
    !!item &&
    canMoveMainProject(item) &&
    item.version === observed.version &&
    item.status === observed.status
  );
}
