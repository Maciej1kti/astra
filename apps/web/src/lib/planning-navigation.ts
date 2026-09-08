import { shiftDate } from "./dates.ts";
import { dateOnly, widgetDate } from "./planning.ts";

export type CalendarLayout = "day" | "week" | "month" | "agenda";

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return dateOnly(widgetDate(value)) === value;
  } catch {
    return false;
  }
}

export function navigateCalendar(
  date: string,
  layout: CalendarLayout,
  delta: number,
): string {
  if (!isCalendarDate(date)) throw new Error("Choose a valid calendar date.");
  if (layout === "month") {
    const next = widgetDate(date);
    next.setDate(1);
    next.setMonth(next.getMonth() + delta);
    return dateOnly(next);
  }
  return shiftDate(date, delta * (layout === "day" ? 1 : 7));
}

export function calendarWidgetView(
  layout: CalendarLayout,
  compact: boolean,
  monthGrid: boolean,
): string {
  if (layout === "month" && compact && !monthGrid) return "listMonth";
  return {
    day: "dayGridDay",
    week: "dayGridWeek",
    month: "dayGridMonth",
    agenda: "listWeek",
  }[layout];
}
