import { all, api, resourcePath, type Resource, type Summary, type ReadOptions } from "./api.ts";
import type { View } from "./navigation";
import { detailSummary } from "./resource-summary.ts";
import { mapReads, isAbortError } from "./read-requests.ts";
import { cursorPage, type Page } from "./pagination.ts";
import { projectionNotice } from "./projection-state.ts";

export type ViewQuery = {
  view: View; project: string; search: string; collection: "cards" | "milestones";
  archived: boolean; status: string; priority: string; label: string;
};
export type Section = "projects" | "focus" | "attention" | "card" | "milestone" | "update" | "planning";
export type FocusRef = { project_id: string; card_id: string };
export type Attention = { id: string; project_id: string; target: { type: "project" | "card" | "milestone"; id: string }; reason: string; label: string; date?: string };
export type Invalidation = { kind?: string; project_id?: string; target?: { type?: string; id?: string } };

export function viewSections(query: ViewQuery): Section[] {
  switch (query.view) {
    case "focus": return ["projects", "focus", "attention", "card", "milestone"];
    case "projects": return ["projects", "card", "update"];
    case "list": return ["projects", query.collection === "cards" ? "card" : "milestone"];
    case "updates": return ["projects", "update"];
    case "board": return ["projects", query.project ? "planning" : "card"];
    case "calendar": case "gantt": return ["projects", "planning"];
  }
}
export function viewQueryKey(query: ViewQuery) {
  // Loaded-title filters do not change the server query or discard view state.
  return JSON.stringify([
    query.view, query.view === "projects" ? "" : query.project,
    ["list", "updates"].includes(query.view) ? query.search.trim() : "",
    ...(query.view === "list" ? [query.collection, query.archived, query.status, query.priority, query.label] : []),
  ]);
}
export function affectedSections(event: Invalidation, query: ViewQuery): Section[] {
  const needed = viewSections(query);
  if (event.kind !== "changed" || !event.target?.type) {
    if (event.kind === "health_changed" && event.project_id && query.project && event.project_id !== query.project)
      return ["projects"];
    return needed;
  }
  const kind = event.target.type;
  if (query.project && query.view !== "projects" && event.project_id && event.project_id !== query.project)
    return kind === "project" ? ["projects"] : [];
  const changed: Section[] = kind === "card" ? ["focus", "attention", "card", "planning"]
    : kind === "milestone" ? ["attention", "milestone", "planning"]
      : kind === "update" ? ["attention", "update"]
        : kind === "project" ? ["projects", "attention", "planning"] : needed;
  return needed.filter((section) => changed.includes(section));
}
export function invalidatesTags(event: Invalidation) {
  return event.kind !== "changed" || event.target?.type === "card" || event.target?.type === "project";
}
export function resourceListPath(query: ViewQuery, type: string, cursor: string | null = null) {
  const params = new URLSearchParams({ type, limit: "200" });
  if (["list", "updates"].includes(query.view) && query.search.trim()) params.set("q", query.search.trim());
  if (query.project && query.view !== "projects") params.set("project_id", query.project);
  if (query.view === "list" && type === (query.collection === "cards" ? "card" : "milestone")) {
    if (query.status) params.set("status", query.status);
    if (type === "card") {
      if (query.archived) params.set("archived", "true");
      if (query.priority) params.set("priority", query.priority);
      if (query.label) params.set("label", query.label);
    }
  }
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/views/list?${params}`;
}
export const resourcePage = (query: ViewQuery, type: string, cursor: string | null, options: ReadOptions = {}) =>
  api<Page<Summary>>(resourceListPath(query, type, cursor), "GET", undefined, {}, options);
export function attentionPage(project: string, cursor: string | null, options: ReadOptions = {}) {
  const params = new URLSearchParams({ limit: "200" });
  if (project) params.set("project_id", project);
  if (cursor) params.set("cursor", cursor);
  return api<Page<Attention>>(`/api/v1/views/attention?${params}`, "GET", undefined, {}, options);
}

export type LoadedView = {
  projects?: Summary[]; focus?: FocusRef[]; focusCards?: Summary[];
  attention?: { value: Page<Attention>; reset: boolean };
  pages: Partial<Record<"card" | "milestone" | "update", { value: Page<Summary>; reset: boolean }>>;
  notices: Partial<Record<Section, string>>;
};
export async function loadView(query: ViewQuery, sections: readonly Section[], cursors: Record<string, string | null>, signal: AbortSignal): Promise<LoadedView> {
  const result: LoadedView = { pages: {}, notices: {} };
  const options = { signal };
  await Promise.all(sections.map(async (section) => {
    if (section === "projects") {
      result.notices.projects = "";
      result.projects = await all("/api/v1/projects", { ...options, onPage: (page) => { result.notices.projects = projectionNotice(page) || result.notices.projects; } });
    }
    else if (section === "focus") result.focus = (await api<{ items: FocusRef[] }>("/api/v1/workspace/focus", "GET", undefined, {}, options)).items;
    else if (section === "attention") {
      result.attention = await cursorPage((cursor) => attentionPage(query.project, cursor, options), cursors.attention ?? null);
      result.notices.attention = projectionNotice(result.attention.value);
    } else if (section !== "planning") {
      const page = await cursorPage((cursor) => resourcePage(query, section, cursor, options), cursors[section] ?? null);
      result.pages[section] = page;
      result.notices[section] = projectionNotice(page.value);
    }
  }));
  signal.throwIfAborted();
  if (result.focus) {
    const cached = new Map((result.pages.card?.value.items ?? []).map((item) => [`${item.project_id}:${item.id}`, item]));
    result.focusCards = await mapReads(result.focus, async (ref): Promise<Summary> => {
      const summary = cached.get(`${ref.project_id}:${ref.card_id}`);
      if (summary) return summary;
      try {
        const resource = await api<Resource>(resourcePath({ type: "card", id: ref.card_id, project_id: ref.project_id }), "GET", undefined, {}, options);
        return detailSummary(resource, ref.project_id, "card");
      } catch (error) {
        if (isAbortError(error)) throw error;
        return { type: "card", id: ref.card_id, project_id: ref.project_id, title: "Unavailable pinned card", version: "", availability: "unavailable" };
      }
    }, signal);
  }
  return result;
}

/** Trailing coalescing with an independent maximum delay during event bursts. */
export function invalidationBatch(flush: (events: Invalidation[]) => void, delay = 150, maxWait = 500) {
  let events: Invalidation[] = [];
  let trailing: ReturnType<typeof setTimeout> | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(trailing); clearTimeout(deadline); trailing = deadline = undefined; events = []; };
  const run = () => { const batch = events; cancel(); if (batch.length) flush(batch); };
  return {
    push(event: Invalidation) {
      // Store only relevant identity, never source content; bounding also handles floods.
      if (events.length < 100) events.push(event);
      else events = [{ kind: "resync_required" }];
      clearTimeout(trailing);
      trailing = setTimeout(run, delay);
      deadline ??= setTimeout(run, maxWait);
    },
    cancel,
  };
}
