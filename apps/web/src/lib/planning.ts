import type { Summary } from "./api";
import { shiftDate } from "./dates.ts";
export type CalendarItem = {
  item_id: string;
  kind: string;
  project_id: string;
  resource_id: string;
  version: string;
  title: string;
  start: string;
  end: string;
  due_kind?: string;
};
export type Edge = {
  from: string;
  to: string;
  outside_page: boolean;
  warning: string | null;
};
export type Forecast = {
  id: string;
  schedule: { start: string; end: string };
  delay_days: number;
  drives_finish: boolean;
};
export type Analysis = {
  planned_start: string | null;
  planned_end: string | null;
  forecast_end: string | null;
  delay_days: number;
  scheduled_cards: number;
  unscheduled_cards: number;
  unresolved_cards: number;
  complete: boolean;
  driving_path: string[];
};
export type GanttPage = import("./projection-state").ProjectionState & {
  rows: Summary[];
  edges: Edge[];
  analysis: Analysis;
  forecasts: Forecast[];
  page: { next_cursor: string | null };
};
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
