import { getCalendar, getGantt } from "../lib/api/planning";
import { planProjectTagRename, applyProjectTagRename } from "../lib/api/tags";
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
  void planProjectTagRename("project", { source: "old" });
  // @ts-expect-error Applying a reviewed rename requires its plan identifier.
  applyProjectTagRename("project", { set: { title: "card" } });
  return { calendar, gantt, wrong };
}
