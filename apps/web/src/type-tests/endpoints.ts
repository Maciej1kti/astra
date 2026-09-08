import { getCalendar, getGantt } from "../lib/api/planning";
import { previewTagChange, replaceTags } from "../lib/api/tags";
import type { CalendarPage, GanttPage } from "../lib/contracts/api.generated";

// Compile-time examples only; this file is not imported by the application.
export function endpointContracts() {
  const calendar: Promise<CalendarPage> = getCalendar(
    { project: "project", from: "2026-09-01", to: "2026-09-30" },
    null,
  );
  const gantt: Promise<GanttPage> = getGantt("project", null);
  // @ts-expect-error Calendar responses are not timeline projections.
  const wrong: Promise<GanttPage> = calendar;
  // @ts-expect-error A rename requires its destination.
  previewTagChange({ source: "old" });
  // @ts-expect-error A catalog contains tag names, not card payloads.
  replaceTags({ set: { title: "card" } }, "version");
  return { calendar, gantt, wrong };
}
