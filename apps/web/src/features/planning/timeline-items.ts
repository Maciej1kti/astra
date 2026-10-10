import type { Summary } from "../../lib/api/api";
import { eventDates } from "../../lib/resources/timed-event.ts";

export type TimelineItem = {
  row: Summary;
  /**
   * A plan can be moved and resized here; events and milestones only open, and
   * so does a goal, whose days are those of its cards.
   */
  kind: "plan" | "event" | "milestone" | "goal";
  /** Inclusive civil days. */
  start: string;
  end: string;
};

/** Rows with recorded dates, in the order given. Undated rows have no place on the axis. */
export function timelineItems(rows: readonly Summary[]): TimelineItem[] {
  return rows.flatMap((row): TimelineItem[] => {
    if (row.type === "project")
      return row.span
        ? [{ row, kind: "goal", start: row.span.start, end: row.span.end }]
        : [];
    if (row.type === "milestone")
      return row.due
        ? [{ row, kind: "milestone", start: row.due.date, end: row.due.date }]
        : [];
    if (row.event) return [{ row, kind: "event", ...eventDates(row.event) }];
    if (row.schedule)
      return [
        {
          row,
          kind: "plan",
          start: row.schedule.start,
          end: row.schedule.end,
        },
      ];
    return [];
  });
}
