import { serverMessage } from "../../lib/api/messages.ts";
import type { Invalidation } from "../../lib/api/invalidations";
import {
  all,
  api,
  resourcePath,
  type Resource,
  type Summary,
  type ReadOptions,
} from "../../lib/api/api.ts";
import type { View } from "./navigation";
import { detailSummary } from "../../lib/resources/resource-summary.ts";
import { mapReads, isAbortError } from "../../lib/api/read-requests.ts";
import { cursorPage, type Page } from "../../lib/api/pagination.ts";
import {
  projectionNotice,
  type ProjectionState,
} from "../../lib/api/projection-state.ts";

export type ViewQuery = {
  view: View;
  project: string;
  folder?: string;
  search: string;
  archived: boolean;
  status: string;
  priority: string;
  label: string;
};
export type Section =
  | "projects"
  | "focus"
  | "attention"
  | "card"
  | "event"
  | "update"
  | "planning"
  | "chart";
export type {
  FocusRef,
  AttentionItem as Attention,
} from "../../lib/contracts/api.generated";
import type {
  FocusRef,
  FocusResource,
  AttentionItem as Attention,
} from "../../lib/contracts/api.generated";

function unavailablePin(ref: FocusRef): Summary {
  return {
    type: "card",
    id: ref.card_id,
    project_id: ref.project_id,
    title: "Niedostępna przypięta karta",
    version: "",
    availability: "unavailable",
  };
}

export function viewSections(query: ViewQuery): Section[] {
  switch (query.view) {
    case "projects":
      return ["projects"];
    case "focus":
      return ["projects", "focus", "attention", "card", "event"];
    case "list":
      return ["projects", "card"];
    case "updates":
      return ["projects", "update"];
    case "board":
      return ["projects", query.project ? "planning" : "card"];
    case "calendar":
    case "gantt":
      return ["projects", "planning"];
    case "chart":
      return ["projects", "chart"];
  }
}
export function viewQueryKey(query: ViewQuery) {
  // Loaded-title filters do not change the server query or discard view state.
  return JSON.stringify([
    query.view,
    ["projects", "focus"].includes(query.view) ? "" : query.project,
    query.view === "focus" ? (query.folder ?? "") : "",
    ["list", "updates"].includes(query.view) ? query.search.trim() : "",
    ...(query.view === "list"
      ? [query.archived, query.status, query.priority, query.label]
      : []),
  ]);
}
export function affectedSections(
  event: Invalidation,
  query: ViewQuery,
): Section[] {
  const needed = viewSections(query);
  if (event.kind !== "changed" || !event.target?.type) {
    if (
      event.kind === "health_changed" &&
      event.project_id &&
      query.project &&
      !["focus", "projects"].includes(query.view) &&
      event.project_id !== query.project
    )
      return ["projects"];
    return needed;
  }
  const kind = event.target.type;
  // A goal's span follows its cards' dates in the views that show it.
  const span =
    kind === "card" && ["projects", "calendar", "gantt"].includes(query.view);
  if (
    query.project &&
    !["projects", "focus"].includes(query.view) &&
    event.project_id &&
    event.project_id !== query.project
  )
    return kind === "project" || span ? ["projects"] : [];
  const changed: Section[] =
    kind === "card"
      ? ["focus", "attention", "card", "event", "planning", "chart"]
      : kind === "milestone"
        ? ["attention", "planning"]
        : kind === "update"
          ? ["attention", "update"]
          : kind === "project"
            ? [
                "projects",
                "focus",
                "card",
                "event",
                "attention",
                "planning",
                "chart",
              ]
            : needed;
  return needed.filter(
    (section) => changed.includes(section) || (span && section === "projects"),
  );
}
export function invalidatesTags(event: Invalidation) {
  return (
    event.kind !== "changed" ||
    (event.target?.type === "card" && event.tags_changed !== false) ||
    event.target?.type === "project"
  );
}
export function resourceListPath(
  query: ViewQuery,
  type: string,
  cursor: string | null = null,
) {
  if (query.view === "focus" && (type === "card" || type === "event")) {
    const params = new URLSearchParams({
      section: type === "card" ? "motion" : "events",
      limit: "200",
    });
    if (query.folder) params.set("folder", query.folder);
    if (cursor) params.set("cursor", cursor);
    return `/api/v1/views/focus-cards?${params}`;
  }
  const params = new URLSearchParams({ type, limit: "200" });
  if (["list", "updates"].includes(query.view) && query.search.trim())
    params.set("q", query.search.trim());
  if (query.project && !["projects", "focus"].includes(query.view))
    params.set("project_id", query.project);
  if (query.view === "list" && type === "card") {
    if (query.status) params.set("status", query.status);
    if (query.archived) params.set("archived", "true");
    if (query.priority) params.set("priority", query.priority);
    if (query.label) params.set("label", query.label);
  }
  if (query.view === "focus") {
    if (query.folder) params.set("folder", query.folder);
  }
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/views/list?${params}`;
}
export const resourcePage = (
  query: ViewQuery,
  type: string,
  cursor: string | null,
  options: ReadOptions = {},
) =>
  api<Page<Summary>>(
    resourceListPath(query, type, cursor),
    "GET",
    undefined,
    {},
    options,
  );
export function attentionPage(
  query: ViewQuery,
  cursor: string | null,
  options: ReadOptions = {},
) {
  const params = new URLSearchParams({ limit: "200" });
  if (query.view === "focus") {
    params.set("focus", "true");
    if (query.folder) params.set("folder", query.folder);
  } else if (query.project) params.set("project_id", query.project);
  if (cursor) params.set("cursor", cursor);
  return api<Page<Attention>>(
    `/api/v1/views/attention?${params}`,
    "GET",
    undefined,
    {},
    options,
  );
}

export type LoadedView = {
  projects?: Summary[];
  focus?: FocusResource;
  focusCards?: Summary[];
  attention?: { value: Page<Attention>; reset: boolean };
  pages: Partial<
    Record<
      "card" | "event" | "update",
      { value: Page<Summary>; reset: boolean }
    >
  >;
  notices: Partial<Record<Section, string>>;
};
export async function loadView(
  query: ViewQuery,
  sections: readonly Section[],
  cursors: Record<string, string | null>,
  signal: AbortSignal,
): Promise<LoadedView> {
  const result: LoadedView = { pages: {}, notices: {} };
  const options = { signal };
  await Promise.all(
    sections.map(async (section) => {
      if (section === "projects") {
        result.notices.projects = "";
        const projectOptions = {
          ...options,
          onPage: (page: ProjectionState) => {
            result.notices.projects =
              projectionNotice(page) || result.notices.projects;
          },
        };
        const pages = await Promise.all(
          (query.view === "projects"
            ? ["/api/v1/projects", "/api/v1/projects?archived=true"]
            : ["/api/v1/projects"]
          ).map((path) => all<Summary>(path, projectOptions)),
        );
        const projects = pages.flat();
        // Independent archive reads can straddle a state change. Keep one complete observation.
        result.projects =
          query.view === "projects"
            ? [...new Map(projects.map((item) => [item.id, item])).values()]
            : projects;
      } else if (section === "focus") {
        result.focus = await api<FocusResource>(
          "/api/v1/workspace/focus",
          "GET",
          undefined,
          {},
          { ...options, fresh: true },
        );
        result.notices.focus =
          result.focus.warnings
            .map((warning) => serverMessage(warning.code))
            .join(" ") || projectionNotice(result.focus);
      } else if (section === "attention") {
        result.attention = await cursorPage(
          (cursor) => attentionPage(query, cursor, options),
          cursors.attention ?? null,
        );
        result.notices.attention = projectionNotice(result.attention.value);
      } else if (section !== "planning" && section !== "chart") {
        const page = await cursorPage(
          (cursor) => resourcePage(query, section, cursor, options),
          cursors[section] ?? null,
        );
        result.pages[section] = page;
        result.notices[section] = projectionNotice(page.value);
      }
    }),
  );
  signal.throwIfAborted();
  if (result.focus) {
    if (result.focus.cards) {
      const summaries = new Map(
        result.focus.cards.map((item) => [
          `${item.project_id}:${item.id}`,
          item,
        ]),
      );
      result.focusCards = result.focus.items.map(
        (ref) =>
          summaries.get(`${ref.project_id}:${ref.card_id}`) ??
          unavailablePin(ref),
      );
      return result;
    }
    // Older hosts expose references only. Keep their bounded detail-read path.
    const cached = new Map(
      (result.pages.card?.value.items ?? []).map((item) => [
        `${item.project_id}:${item.id}`,
        item,
      ]),
    );
    result.focusCards = await mapReads(
      result.focus.items,
      async (ref): Promise<Summary> => {
        const summary = cached.get(`${ref.project_id}:${ref.card_id}`);
        if (summary) return summary;
        try {
          const resource = await api<Resource>(
            resourcePath({
              type: "card",
              id: ref.card_id,
              project_id: ref.project_id,
            }),
            "GET",
            undefined,
            {},
            options,
          );
          return detailSummary(resource, ref.project_id, "card");
        } catch (error) {
          if (isAbortError(error)) throw error;
          return unavailablePin(ref);
        }
      },
      signal,
    );
  }
  return result;
}
