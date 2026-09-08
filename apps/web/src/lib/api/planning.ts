import { api, type ReadOptions } from "./api.ts";
import type { CalendarPage, GanttPage } from "../contracts/api.generated";

export function getCalendar(
  scope: { project: string; from: string; to: string },
  cursor: string | null,
  options: ReadOptions = {},
) {
  const query = new URLSearchParams({
    from: scope.from,
    to: scope.to,
    limit: "1000",
  });
  if (scope.project) query.set("project_id", scope.project);
  if (cursor) query.set("cursor", cursor);
  return api<CalendarPage>(
    `/api/v1/views/calendar?${query}`,
    "GET",
    undefined,
    {},
    options,
  );
}

export function getGantt(
  project: string,
  cursor: string | null,
  options: ReadOptions = {},
) {
  const query = new URLSearchParams({ project_id: project, limit: "200" });
  if (cursor) query.set("cursor", cursor);
  return api<GanttPage>(
    `/api/v1/views/gantt?${query}`,
    "GET",
    undefined,
    {},
    options,
  );
}
