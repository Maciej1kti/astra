import type { Summary } from "../../lib/api/api";
import { shiftDate } from "./dates.ts";
export type {
  CalendarItem,
  GanttEdge as Edge,
  TimelineForecast as Forecast,
  TimelineAnalysis as Analysis,
  GanttPage,
} from "../../lib/contracts/api.generated";
import type { CalendarItem } from "../../lib/contracts/api.generated";
/** Widget Date objects carry local calendar fields, never canonical timestamps. */
export function widgetDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function dateOnly(date: Date): string {
  const value = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()))
    throw new Error("Date is outside the supported calendar.");
  return value;
}
export function exclusiveSchedule(schedule: { start: string; end: string }) {
  return {
    start: widgetDate(schedule.start),
    end: widgetDate(shiftDate(schedule.end, 1)),
  };
}
export function inclusiveSchedule(start: Date, end: Date) {
  const result = { start: dateOnly(start), end: shiftDate(dateOnly(end), -1) };
  if (result.start > result.end)
    throw new Error("A plan must cover at least one day.");
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
  return item.kind.endsWith("due")
    ? `${item.due_kind ?? "target"} deadline`
    : item.kind.endsWith("review")
      ? "Review"
      : "Planned work";
}
