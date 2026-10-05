import type { Summary } from "../../lib/api/api";
import { shiftDate } from "./dates.ts";
export type {
  CalendarItem,
  GanttPage,
} from "../../lib/contracts/api.generated";
import type { CalendarItem } from "../../lib/contracts/api.generated";
import { dateOnly, widgetDate } from "./widget-dates.ts";
export function exclusiveSchedule(schedule: { start: string; end: string }) {
  return {
    start: widgetDate(schedule.start),
    end: widgetDate(shiftDate(schedule.end, 1)),
  };
}
export function inclusiveSchedule(start: Date, end: Date) {
  const result = { start: dateOnly(start), end: shiftDate(dateOnly(end), -1) };
  if (result.start > result.end)
    throw new Error("Plan musi obejmować co najmniej jeden dzień.");
  return result;
}
export function calendarTarget(
  item: CalendarItem,
): Pick<Summary, "id" | "project_id" | "type"> {
  return {
    id: item.resource_id,
    project_id: item.project_id,
    type: item.kind.startsWith("milestone")
      ? "milestone"
      : item.kind.startsWith("project")
        ? "project"
        : "card",
  };
}
export function calendarLabel(item: CalendarItem) {
  return item.event
    ? `Wydarzenie ${item.event.start.slice(11)} · ${item.event.duration_minutes} min`
    : item.kind.endsWith("due")
      ? "Termin"
      : "Zaplanowana praca";
}
