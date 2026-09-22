import type { Summary } from "../../lib/api/api";
export const GANTT_CONTEXT = Symbol("astra-gantt");
export type GanttContext = {
  open: (row: Summary) => void;
  propose: (
    row: Summary,
    days: number,
    operation: "move" | "start" | "end",
  ) => void;
  editable: () => boolean;
  gesture: (active: boolean) => void;
};
