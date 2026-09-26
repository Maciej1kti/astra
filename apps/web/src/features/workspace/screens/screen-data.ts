import type { Summary } from "../../../lib/api/api";
import type { WorkspaceRoute } from "../navigation";

export type OpenResource = (
  item: Pick<Summary, "type" | "id" | "project_id">,
) => Promise<void>;

export function projectLabel(projects: Summary[], id: string): string {
  return (
    projects.find((project) => project.id === id)?.title ??
    "Unavailable project"
  );
}

/** List filtering is server-owned; overview screens filter their loaded titles. */
export function visibleCards(
  cards: Summary[],
  route: Readonly<WorkspaceRoute>,
  projects: Summary[] = [],
  includeArchived = false,
): Summary[] {
  return cards.filter(
    (card) =>
      (route.view === "focus"
        ? !route.folder ||
          projects.some(
            (p) => p.id === card.project_id && p.folder === route.folder,
          )
        : !route.project || card.project_id === route.project) &&
      (route.view === "list"
        ? !!card.archived === route.archived
        : includeArchived || !card.archived) &&
      (route.view === "list" ||
        card.title.toLowerCase().includes(route.search.trim().toLowerCase())),
  );
}
