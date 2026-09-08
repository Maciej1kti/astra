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
): Summary[] {
  return cards.filter(
    (card) =>
      (!route.project || card.project_id === route.project) &&
      (route.view === "list"
        ? !!card.archived === route.archived
        : !card.archived) &&
      (route.view === "list" ||
        card.title.toLowerCase().includes(route.search.trim().toLowerCase())),
  );
}
