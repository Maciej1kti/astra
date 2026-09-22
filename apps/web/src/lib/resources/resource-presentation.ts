import type { Summary } from "../api/api";

const labels: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
  decision_needed: "Decision needed",
};

export function resourceLabel(value: string): string {
  return (
    labels[value] ??
    value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export type ResourceDateBadge = {
  kind: "due" | "plan";
  label: string;
  start: string;
  end?: string;
};

/** Keep milestone due dates and planned work separate on every surface. */
export function resourceDates(item: Summary): ResourceDateBadge[] {
  const dates: ResourceDateBadge[] = [];
  if (item.type === "milestone" && item.due) {
    dates.push({
      kind: "due",
      label: "Due",
      start: item.due.date,
    });
  }
  if (item.schedule) {
    dates.push({
      kind: "plan",
      label: "Plan",
      start: item.schedule.start,
      ...(item.schedule.end !== item.schedule.start
        ? { end: item.schedule.end }
        : {}),
    });
  }
  return dates;
}
