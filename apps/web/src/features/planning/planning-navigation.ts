import { isCivilDate } from "../../lib/ui/calendar-dates.ts";
import { shiftDate } from "./dates.ts";
import { dateOnly, widgetDate } from "./planning.ts";

export type CalendarLayout = "day" | "week" | "month" | "agenda";

/** A civil date that this browser's local calendar can also represent for the widgets. */
export function isCalendarDate(value: string): boolean {
  if (!isCivilDate(value)) return false;
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
  if (!isCalendarDate(date))
    throw new Error("Wybierz prawidłową datę kalendarza.");
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
    day: "timeGridDay",
    week: "timeGridWeek",
    month: "dayGridMonth",
    agenda: "listWeek",
  }[layout];
}
