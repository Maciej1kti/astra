import type { ITask } from "@svar-ui/svelte-gantt";
import type { Summary } from "../../lib/api/api";
import { exclusiveSchedule, widgetDate } from "./planning.ts";

export type AstraTask = ITask & {
  astra: Summary;
  plannedStart?: string;
  plannedEnd?: string;
};

/** Vendor fields are derived from the saved schedules in the projection. */
export function ganttTasks(rows: Summary[]): AstraTask[] {
  return rows.flatMap((row): AstraTask[] => {
    if (row.type === "milestone" && row.due)
      return [
        {
          id: row.id,
          text: row.title,
          type: "milestone",
          start: widgetDate(row.due.date),
          duration: 0,
          astra: row,
        },
      ];
    const schedule = row.schedule;
    if (!schedule) return [];
    return [
      {
        id: row.id,
        text: row.title,
        type: "task",
        ...exclusiveSchedule(schedule),
        plannedStart: schedule.start,
        plannedEnd: schedule.end,
        astra: row,
      },
    ];
  });
}
