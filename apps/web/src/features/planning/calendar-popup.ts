import type { CalendarItem } from "./planning.ts";

interface PopupEvent {
  title: string;
  allDay: boolean;
  display: string;
  backgroundColor?: string;
  textColor?: string;
  styles: string[];
  classNames: string[];
  resourceIds: unknown[];
  extendedProps?: { astra?: CalendarItem };
}

interface PopupOptions {
  eventContent?: unknown;
  eventClassNames?: unknown;
  eventDidMount?: unknown;
  eventMouseEnter?: unknown;
  eventMouseLeave?: unknown;
}

/** Other native content and extension hooks retain the original renderer. */
export function calendarPopupEligible(
  event: PopupEvent,
  resource: unknown,
  resources: unknown[],
  options: PopupOptions,
  snippet: unknown,
) {
  const item = event.extendedProps?.astra;
  return !!(
    item &&
    ["card_schedule", "card_event", "milestone_due", "project_span"].includes(
      item.kind,
    ) &&
    item.title.trim() &&
    event.title === item.title &&
    event.allDay === !item.event &&
    event.display === "auto" &&
    typeof event.backgroundColor === "string" &&
    typeof event.textColor === "string" &&
    Array.isArray(event.styles) &&
    event.styles.length === 0 &&
    Array.isArray(event.classNames) &&
    event.classNames.length === 0 &&
    Array.isArray(event.resourceIds) &&
    event.resourceIds.length === 0 &&
    !resource &&
    resources.length === 0 &&
    options.eventContent == null &&
    options.eventClassNames == null &&
    options.eventDidMount == null &&
    options.eventMouseEnter == null &&
    options.eventMouseLeave == null &&
    typeof snippet === "function"
  );
}
