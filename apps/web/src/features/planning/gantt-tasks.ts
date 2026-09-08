import type { ITask } from "@svar-ui/svelte-gantt";
import type {
  Summary,
  TimelineForecast,
} from "../../lib/contracts/api.generated";
import { exclusiveSchedule, widgetDate } from "./planning.ts";

export type AstraTask = ITask & {
  astra: Summary;
  astraDriving: boolean;
  plannedStart?: string;
  plannedEnd?: string;
};

/** Vendor fields are derived from projections; forecasts never mutate source rows. */
export function ganttTasks(
  rows: Summary[],
  forecasts: ReadonlyMap<string, TimelineForecast>,
  preview: boolean,
): AstraTask[] {
  return rows.flatMap((row): AstraTask[] => {
    const forecast = forecasts.get(row.id);
    const schedule = preview ? forecast?.schedule : row.schedule;
    if (row.type === "milestone" && row.due)
      return [
        {
          id: row.id,
          text: row.title,
          type: "milestone",
          start: widgetDate(row.due.date),
          duration: 0,
          astra: row,
          astraDriving: false,
        },
      ];
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
        astraDriving: forecast?.drives_finish ?? false,
      },
    ];
  });
}
