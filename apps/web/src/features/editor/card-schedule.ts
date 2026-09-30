import type { CardFields } from "./editor-draft";
import { counterDay } from "../cards/card-counters.ts";
import { dayDistance } from "../planning/dates.ts";
import { eventEnd } from "../../lib/resources/timed-event.ts";

type Schedule = Pick<
  CardFields,
  "start" | "end" | "time" | "duration" | "status"
>;
type Summary = {
  text: string;
  detail?: string;
  overdue?: boolean;
  valid: boolean;
};
const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;
const dateValid = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const interval = (minutes: number) =>
  minutes < 60
    ? `${Math.ceil(minutes)}m`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${Math.floor(minutes % 60)}m` : ""}`
      : `${Math.floor(minutes / 1440)}d`;

/** Relative dates use the workspace calendar, independent of the device timezone. */
export function cardScheduleSummary(
  fields: Schedule,
  timezone: string,
  now = Date.now(),
): Summary {
  const { start, end, time, duration, status } = fields;
  const finished = status === "done" || status === "cancelled";
  if (!start && !end && !time) return { text: "No schedule", valid: true };
  const invalid = { text: "Check schedule", valid: false };
  if (!dateValid(start)) return invalid;
  if (time) {
    let finish: string;
    try {
      finish = eventEnd({
        start: `${start}T${time}`,
        duration_minutes: duration,
      });
    } catch {
      return invalid;
    }
    if (finished) return { text: `${interval(duration)} event`, valid: true };
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    const current = Date.parse(
      `${counterDay(timezone, now)}T${part("hour")}:${part("minute")}:00Z`,
    );
    const until = (Date.parse(`${start}T${time}:00Z`) - current) / 60000;
    const left = (Date.parse(`${finish}:00Z`) - current) / 60000;
    if (until > 0)
      return {
        text: `Starts in ${interval(until)}`,
        detail: "Event",
        valid: true,
      };
    if (left > 0)
      return {
        text: `${interval(left)} left`,
        detail: "In progress",
        valid: true,
      };
    return {
      text: left === 0 ? "Just ended" : `Ended ${interval(-left)} ago`,
      valid: true,
    };
  }
  if (!dateValid(end) || end < start) return invalid;
  const total = dayDistance(start, end) + 1;
  if (finished) return { text: `${total}-day plan`, valid: true };
  const today = counterDay(timezone, now);
  const until = dayDistance(today, start);
  const left = dayDistance(today, end);
  if (until > 0)
    return {
      text: until === 1 ? "Starts tomorrow" : `Starts in ${days(until)}`,
      detail: days(total),
      valid: true,
    };
  return {
    text:
      left < 0
        ? `${days(-left)} overdue`
        : left === 0
          ? "Ends today"
          : `${days(left)} left`,
    detail: `Day ${dayDistance(start, today) + 1}`,
    overdue: left < 0,
    valid: true,
  };
}
