import { isCalendarDate, type CalendarLayout } from "./planning-navigation.ts";

export const workspaceViews = [
  "focus",
  "projects",
  "board",
  "calendar",
  "gantt",
  "list",
  "updates",
] as const;
export type View = (typeof workspaceViews)[number];
export type WorkspaceRoute = {
  view: View;
  project: string;
  search: string;
  collection: "cards" | "milestones";
  archived: boolean;
  status: string;
  priority: string;
  label: string;
  unreadOnly: boolean;
  month: string;
  calendarDate: string;
  calendarLayout: CalendarLayout;
  resource?: { project: string; type: string; id: string };
};
const validId = (value: string | null): value is string =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );

export function readRoute(
  params: URLSearchParams,
  today: string,
  defaultView: View = "focus",
): WorkspaceRoute {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") ?? "")
    ? params.get("month")!
    : today.slice(0, 7);
  const date = params.get("date") ?? "";
  const project = validId(params.get("project")) ? params.get("project")! : "";
  const resourceProject = validId(params.get("resource_project"))
    ? params.get("resource_project")!
    : project;
  const id = params.get("resource"),
    type = params.get("type") ?? "";
  return {
    view: workspaceViews.includes(params.get("view") as View)
      ? (params.get("view") as View)
      : defaultView,
    project,
    search: params.get("q") ?? "",
    collection:
      params.get("collection") === "milestones" ? "milestones" : "cards",
    archived: params.get("archived") === "true",
    status: params.get("status") ?? "",
    priority: params.get("priority") ?? "",
    label: params.get("label") ?? "",
    unreadOnly: params.get("unread") === "true",
    month,
    calendarDate: isCalendarDate(date)
      ? date
      : params.has("month")
        ? `${month}-01`
        : today,
    calendarLayout: ["day", "week", "month", "agenda"].includes(
      params.get("layout") ?? "",
    )
      ? (params.get("layout") as CalendarLayout)
      : "month",
    ...(resourceProject &&
    validId(id) &&
    ["project", "card", "milestone", "update"].includes(type)
      ? { resource: { project: resourceProject, type, id } }
      : {}),
  };
}

export function writeRoute(state: WorkspaceRoute): URLSearchParams {
  const params = new URLSearchParams({ view: state.view });
  if (state.project) params.set("project", state.project);
  if (state.search) params.set("q", state.search);
  if (state.view === "list") {
    if (state.collection !== "cards")
      params.set("collection", state.collection);
    if (state.archived && state.collection === "cards")
      params.set("archived", "true");
    if (state.status) params.set("status", state.status);
    if (state.priority && state.collection === "cards")
      params.set("priority", state.priority);
    if (state.label && state.collection === "cards")
      params.set("label", state.label);
  }
  if (state.view === "updates" && state.unreadOnly)
    params.set("unread", "true");
  if (state.view === "gantt") params.set("month", state.month);
  if (state.view === "calendar") {
    params.set("date", state.calendarDate);
    params.set("layout", state.calendarLayout);
  }
  if (state.resource) {
    params.set("resource_project", state.resource.project);
    params.set("type", state.resource.type);
    params.set("resource", state.resource.id);
  }
  return params;
}

export function searchOnlyNavigation(
  previous: URLSearchParams,
  next: URLSearchParams,
): boolean {
  const before = new URLSearchParams(previous),
    after = new URLSearchParams(next);
  before.delete("q");
  after.delete("q");
  before.sort();
  after.sort();
  return before.toString() === after.toString();
}

export function primaryResource(
  view: View,
  collection: string,
): "card" | "milestone" | "update" {
  return view === "updates"
    ? "update"
    : view === "list" && collection === "milestones"
      ? "milestone"
      : "card";
}
