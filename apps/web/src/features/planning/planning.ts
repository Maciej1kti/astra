import type { Summary } from "../../lib/api/api";
import { shiftDate } from "./dates.ts";
export type { GanttPage } from "../../lib/contracts/api.generated";
import type { CalendarItem as DatedItem } from "../../lib/contracts/api.generated";
import { dateOnly } from "./widget-dates.ts";

/**
 * A goal over the days its cards cover. It is drawn like a dated item but is
 * derived from those cards, so nothing here can move or stretch it.
 */
export type GoalItem = Omit<DatedItem, "kind" | "event"> & {
  kind: "project_span";
  event?: undefined;
};
export type CalendarItem = DatedItem | GoalItem;

/** Goals that have a span, as Calendar items; a goal without dated cards has no place. */
export function goalItems(goals: readonly Summary[]): GoalItem[] {
  return goals.flatMap((goal) =>
    goal.type === "project" && goal.span
      ? [
          {
            item_id: `goal:${goal.id}`,
            kind: "project_span" as const,
            project_id: goal.id,
            resource_id: goal.id,
            version: goal.version,
            title: goal.title,
            start: goal.span.start,
            end: goal.span.end,
          },
        ]
      : [],
  );
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
      : item.kind === "project_span"
        ? "Cel"
        : "Zaplanowana praca";
}
