import { resourcePath } from "../../lib/api/api.ts";
import { shiftDate, shiftedSchedule } from "./dates.ts";
import {
  calendarLabel,
  calendarTarget,
  type CalendarItem,
} from "./planning.ts";
import type { CalendarLayout } from "./planning-navigation.ts";
import type { DateProposal } from "./proposals.ts";

const layouts = ["day", "week", "month", "agenda"] as const;

/** Alt shortcuts of the planning region; they never intercept text editing. */
export function calendarShortcuts(
  node: HTMLElement,
  actions: {
    navigate: (delta: number) => void;
    today: () => void;
    layout: (value: CalendarLayout) => void;
  },
) {
  const shortcuts = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      actions.navigate(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      actions.navigate(1);
    }
    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      actions.today();
    }
    if (["1", "2", "3", "4"].includes(event.key)) {
      event.preventDefault();
      actions.layout(layouts[Number(event.key) - 1]);
    }
  };
  node.addEventListener("keydown", shortcuts);
  return { destroy: () => node.removeEventListener("keydown", shortcuts) };
}

/** Alt+arrow moves a card's plan or event by a day, or by a week with Shift. */
export function keyboardDateProposal(
  event: Pick<KeyboardEvent, "key" | "altKey" | "shiftKey">,
  item: CalendarItem,
): DateProposal | null {
  if (
    !event.altKey ||
    !["ArrowLeft", "ArrowRight"].includes(event.key) ||
    (item.kind !== "card_schedule" && item.kind !== "card_event")
  )
    return null;
  const days = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1);
  return {
    path: resourcePath(calendarTarget(item)),
    version: item.version,
    ...(item.event
      ? {
          event: {
            ...item.event,
            start: `${shiftDate(item.event.start.slice(0, 10), days)}T${item.event.start.slice(11)}`,
          },
        }
      : { schedule: shiftedSchedule(item, days, "move") }),
  };
}

/**
 * Keyboard access for one rendered calendar event: its native wrapper gets the
 * accessible name and source version, Enter/Space opens it and Alt+arrow
 * proposes new dates while the view can accept a proposal.
 */
export function calendarEventAccess(handlers: {
  open: (item: CalendarItem) => void;
  movable: () => boolean;
  propose: (proposal: DateProposal) => void;
}) {
  return (node: HTMLElement, item: CalendarItem) => {
    const parent = node.closest<HTMLElement>("article, [role=button]");
    const label = () => {
      parent?.setAttribute(
        "aria-label",
        `${calendarLabel(item)}: ${item.title}`,
      );
      parent?.setAttribute("data-source-version", item.version);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopImmediatePropagation();
        handlers.open(item);
      }
      const proposal = handlers.movable()
        ? keyboardDateProposal(event, item)
        : null;
      if (proposal) {
        event.preventDefault();
        event.stopImmediatePropagation();
        handlers.propose(proposal);
      }
    };
    label();
    parent?.addEventListener("keydown", key, true);
    return {
      update: (next: CalendarItem) => {
        item = next;
        label();
      },
      destroy: () => parent?.removeEventListener("keydown", key, true),
    };
  };
}

/**
 * Follows one pointer gesture over the calendar. A second pointer, Escape,
 * pointercancel or rotation cancels it; release is reported after the
 * widget's own handlers for the same event have run.
 */
export function calendarGestureGuard(
  node: HTMLElement,
  hooks: { started: () => void; released: () => void; cancelled: () => void },
) {
  let pointer: number | null = null;
  const down = (event: PointerEvent) => {
    if (pointer !== null && pointer !== event.pointerId) {
      cancel();
      return;
    }
    if (!node.contains(event.target as Node) || event.button !== 0) return;
    pointer = event.pointerId;
    hooks.started();
  };
  const release = () => {
    queueMicrotask(() => {
      pointer = null;
      hooks.released();
    });
  };
  const cancel = () => {
    if (pointer === null) return;
    hooks.cancelled();
    release();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") cancel();
  };
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("orientationchange", cancel);
  window.addEventListener("keydown", key, true);
  return {
    destroy: () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("orientationchange", cancel);
      window.removeEventListener("keydown", key, true);
    },
  };
}
