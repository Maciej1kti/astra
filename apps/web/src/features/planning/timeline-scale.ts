import { dayDistance } from "../../lib/ui/calendar-dates.ts";
import { shiftDate } from "./dates.ts";

/**
 * Timeline geometry in whole civil days. Nothing here reads the DOM, a locale
 * or the browser's timezone, so the same numbers place headers, bars and
 * gesture previews.
 */
export type TimelineScale = "days" | "weeks" | "months";
export const timelineScales: readonly TimelineScale[] = [
  "days",
  "weeks",
  "months",
];
export type TimelineAxis = { start: string; days: number };
export type AxisSegment = {
  /** First civil day the segment shows. */
  start: string;
  /** Days from the axis start to that day. */
  offset: number;
  span: number;
};

/** How far from the requested month the axis may reach, in months. */
const reach = 18;

export function shiftMonth(month: string, delta: number): string {
  const [year = NaN, index = NaN] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, index - 1 + delta, 1));
  return value.toISOString().slice(0, 7);
}

export function monthLength(month: string): number {
  const [year = NaN, index = NaN] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

/** Monday is 0 and Sunday is 6. */
export function weekday(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Whole months around the requested month and the dated rows near it. Rows
 * further away than the reach stay off the axis; the view offers a jump to them
 * instead of drawing years of empty days. The axis always runs a month and
 * `visibleDays` past the first of the requested month, so any of its days can
 * stand at the left edge of the view at any scale.
 */
export function timelineAxis(
  month: string,
  dates: readonly string[],
  visibleDays = 0,
): TimelineAxis {
  const earliest = shiftMonth(month, -reach);
  const latest = shiftMonth(month, reach);
  let first = month;
  let last = month;
  for (const date of dates) {
    const value = date.slice(0, 7);
    if (value < first) first = value < earliest ? earliest : value;
    if (value > last) last = value > latest ? latest : value;
  }
  const start = `${shiftMonth(first, -1)}-01`;
  const end = `${shiftMonth(last, 2)}-01`;
  return {
    start,
    days: Math.max(
      dayDistance(start, end),
      dayDistance(start, `${shiftMonth(month, 1)}-01`) + Math.ceil(visibleDays),
    ),
  };
}

export function dayOffset(axis: TimelineAxis, date: string): number {
  return dayDistance(axis.start, date);
}

export function axisDate(axis: TimelineAxis, offset: number): string {
  return shiftDate(
    axis.start,
    Math.max(0, Math.min(axis.days - 1, Math.floor(offset))),
  );
}

/** Calendar months or years the axis crosses, clipped to its ends. */
export function calendarSegments(
  axis: TimelineAxis,
  unit: "month" | "year",
): AxisSegment[] {
  const segments: AxisSegment[] = [];
  let offset = 0;
  let start = axis.start;
  while (offset < axis.days) {
    const next =
      unit === "month"
        ? `${shiftMonth(start.slice(0, 7), 1)}-01`
        : `${String(Number(start.slice(0, 4)) + 1).padStart(4, "0")}-01-01`;
    const span = Math.min(dayDistance(start, next), axis.days - offset);
    segments.push({ start, offset, span });
    offset += span;
    start = next;
  }
  return segments;
}

/** Weeks beginning on the workspace's first weekday; the ends may be partial. */
export function weekSegments(
  axis: TimelineAxis,
  firstWeekday: number,
): AxisSegment[] {
  const segments: AxisSegment[] = [];
  let offset = 0;
  let span = 7 - ((weekday(axis.start) - firstWeekday + 7) % 7);
  while (offset < axis.days) {
    span = Math.min(span, axis.days - offset);
    segments.push({ start: shiftDate(axis.start, offset), offset, span });
    offset += span;
    span = 7;
  }
  return segments;
}

/** A row's inclusive dates as day offsets, or null when none of it is on the axis. */
export function axisSpan(
  axis: TimelineAxis,
  start: string,
  end: string,
): { offset: number; span: number } | null {
  const from = dayDistance(axis.start, start);
  const to = dayDistance(axis.start, end);
  if (to < 0 || from >= axis.days) return null;
  const offset = Math.max(0, from);
  return { offset, span: Math.min(axis.days - 1, to) - offset + 1 };
}
