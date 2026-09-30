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
  const needle = search.toLowerCase();
  return items
    .filter((item) => item.title.toLowerCase().includes(needle))
    .map((item) => calendarEvent(item, editable));
}

function calendarEvent(
  item: CalendarItem,
  editable: boolean,
): Calendar.EventInput {
  const writable =
    (item.kind === "card_schedule" || item.kind === "card_event") && editable;
  return {
    id: `${item.project_id}:${item.item_id}`,
    start: item.event?.start ?? item.start,
    end: item.event ? eventEnd(item.event) : shiftDate(item.end, 1),
    allDay: !item.event,
    title: item.title,
    editable: writable,
    startEditable: writable,
    durationEditable: writable,
    extendedProps: { astra: item },
    backgroundColor: item.kind.endsWith("due")
      ? "var(--calendar-due-bg)"
      : "var(--calendar-plan-bg)",
    textColor: "var(--ink)",
  };
}

// Exhaustive field sets make a projection contract extension require review.
const itemFields = Object.keys({
  item_id: true,
  kind: true,
  project_id: true,
  resource_id: true,
  version: true,
  title: true,
  start: true,
  end: true,
} satisfies Record<Exclude<keyof CalendarItem, "event">, true>) as Exclude<
  keyof CalendarItem,
  "event"
>[];
const eventFields = Object.keys({
  start: true,
  duration_minutes: true,
} satisfies Record<
  keyof NonNullable<CalendarItem["event"]>,
  true
>) as (keyof NonNullable<CalendarItem["event"]>)[];

function sameItem(left: CalendarItem, right: CalendarItem): boolean {
  for (const field of itemFields)
    if (left[field] !== right[field]) return false;
  if (!left.event || !right.event) return left.event === right.event;
  for (const field of eventFields)
    if (left.event[field] !== right.event[field]) return false;
  return true;
}

/** Retain only this view's displayed page, never its source-read authority. */
export function calendarEventProjection() {
  let previous = new Map<string, Calendar.EventInput>();
  let events: Calendar.EventInput[] = [];
  return (items: CalendarItem[], search: string, editable: boolean) => {
    const needle = search.toLowerCase();
    const next = new Map<string, Calendar.EventInput>();
    const result: Calendar.EventInput[] = [];
    for (const item of items) {
      if (!item.title.toLowerCase().includes(needle)) continue;
      const id = `${item.project_id}:${item.item_id}`;
      let event = previous.get(id);
      const writable =
        (item.kind === "card_schedule" || item.kind === "card_event") &&
        editable;
      if (
        !event ||
        event.editable !== writable ||
        !sameItem(event.extendedProps!.astra as CalendarItem, item)
      ) {
        // Keep an owned snapshot; later caller mutations cannot change its identity.
        const snapshot = {
          ...item,
          ...(item.event ? { event: { ...item.event } } : {}),
        };
        event = calendarEvent(snapshot, editable);
      }
      next.set(id, event);
      result.push(event);
    }
    previous = next;
    if (
      events.length !== result.length ||
      result.some((event, index) => event !== events[index])
    )
      events = result;
    return events;
  };
}
