import type { Summary } from "../../../lib/api/api.ts";
import type { WorkspaceRoute } from "../navigation.ts";
import type { Attention } from "../view-queries.ts";
import { visibleCards } from "./screen-data.ts";

export type FocusAttention = Attention & { reasons: string[] };
export type FocusCard = Summary & { attentionReasons: string[] };

export function resourceKey(
  item: Pick<Summary, "project_id" | "type" | "id">,
): string {
  return `${item.project_id}:${item.type}:${item.id}`;
}

export function attentionKey(item: Attention): string {
  if (item.report_id) return `${item.project_id}:update:${item.report_id}`;
  return `${item.project_id}:${item.target.type}:${item.target.id}`;
}

/** Group one loaded attention page while retaining its first row's order. */
export function groupedAttention(
  rows: Attention[],
  route: Readonly<WorkspaceRoute>,
  projects: Summary[] = [],
): FocusAttention[] {
  const grouped = new Map<string, FocusAttention>();
  const search = route.search.trim().toLowerCase();
  for (const item of rows) {
    if (
      (route.view === "focus"
        ? !!route.folder &&
          !projects.some(
            (p) => p.id === item.project_id && p.folder === route.folder,
          )
        : route.project && item.project_id !== route.project) ||
      (search && !item.label.toLowerCase().includes(search))
    )
      continue;
    const key = attentionKey(item);
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.reasons.includes(item.reason))
        existing.reasons.push(item.reason);
    } else grouped.set(key, { ...item, reasons: [item.reason] });
  }
  return [...grouped.values()];
}

export type FocusSections = {
  focusCards: FocusCard[];
  attention: FocusAttention[];
  activeCards: Summary[];
};

/**
 * Keep cards in one visible section. Pinned cards win over attention rows;
 * attention card targets then stay out of the active card page.
 */
export function focusSections(
  cards: Summary[],
  pinnedCards: Summary[],
  attentionRows: Attention[],
  route: Readonly<WorkspaceRoute>,
  projects: Summary[] = [],
): FocusSections {
  const visibleFocus = visibleCards(pinnedCards, route, projects);
  const attention = groupedAttention(attentionRows, route, projects);
  const pinnedKeys = new Set(visibleFocus.map(resourceKey));
  const attentionCardKeys = new Set(
    attention.filter((item) => item.target.type === "card").map(attentionKey),
  );
  const focus = visibleFocus.map((item) => ({
    ...item,
    attentionReasons:
      attention.find((entry) => attentionKey(entry) === resourceKey(item))
        ?.reasons ?? [],
  }));
  return {
    focusCards: focus,
    attention: attention.filter((item) => !pinnedKeys.has(attentionKey(item))),
    activeCards: visibleCards(cards, route, projects).filter(
      (item) =>
        item.status === "active" &&
        !pinnedKeys.has(resourceKey(item)) &&
        !attentionCardKeys.has(resourceKey(item)),
    ),
  };
}
