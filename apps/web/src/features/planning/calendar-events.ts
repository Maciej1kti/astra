import type { Calendar } from "@event-calendar/core";
import type { CalendarItem } from "../../lib/contracts/api.generated";
import { shiftDate } from "./dates.ts";

/** Calendar uses exclusive end dates; domain projections use inclusive dates. */
export function calendarEvents(
  items: CalendarItem[],
  search: string,
  editable: boolean,
): Calendar.EventInput[] {
  return items
    .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
    .map((item) => ({
      id: `${item.project_id}:${item.item_id}`,
      start: item.start,
      end: shiftDate(item.end, 1),
      allDay: true,
      title: item.title,
      editable: item.kind === "card_schedule" && editable,
      startEditable: item.kind === "card_schedule" && editable,
      durationEditable: item.kind === "card_schedule" && editable,
      extendedProps: { astra: item },
      backgroundColor: item.kind.endsWith("due")
        ? "var(--calendar-due-bg)"
        : item.kind.endsWith("review")
          ? "var(--calendar-review-bg)"
          : "var(--calendar-plan-bg)",
      textColor: "var(--ink)",
    }));
}
