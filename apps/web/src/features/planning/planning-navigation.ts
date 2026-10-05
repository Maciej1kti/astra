import { shiftDate } from "./dates.ts";
import { dateOnly, isCalendarDate, widgetDate } from "./widget-dates.ts";

export type CalendarLayout = "day" | "week" | "month" | "agenda";

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
