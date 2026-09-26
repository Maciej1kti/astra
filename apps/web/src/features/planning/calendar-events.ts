import type { Calendar } from "@event-calendar/core";
import type { CalendarItem } from "../../lib/contracts/api.generated";
import { eventEnd } from "../../lib/resources/timed-event.ts";
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
      start: item.event?.start ?? item.start,
      end: item.event ? eventEnd(item.event) : shiftDate(item.end, 1),
      allDay: !item.event,
      title: item.title,
      editable:
        (item.kind === "card_schedule" || item.kind === "card_event") &&
        editable,
      startEditable:
        (item.kind === "card_schedule" || item.kind === "card_event") &&
        editable,
      durationEditable:
        (item.kind === "card_schedule" || item.kind === "card_event") &&
        editable,
      extendedProps: { astra: item },
      backgroundColor: item.kind.endsWith("due")
        ? "var(--calendar-due-bg)"
        : "var(--calendar-plan-bg)",
      textColor: "var(--ink)",
    }));
}
