import type { Summary } from "./api";
export const GANTT_CONTEXT = Symbol("astra-gantt");
export type GanttContext = {
  open: (row: Summary) => void;
  propose: (
    row: Summary,
    days: number,
    operation: "move" | "start" | "end",
  ) => void;
  link: (row: Summary) => void;
  editable: () => boolean;
};
