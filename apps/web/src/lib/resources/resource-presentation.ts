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
  kind: "hard" | "target" | "plan" | "review";
  label: string;
  start: string;
  end?: string;
};

/** Keep deadlines, planned work and review dates separate on every surface. */
export function resourceDates(item: Summary): ResourceDateBadge[] {
  const dates: ResourceDateBadge[] = [];
  if (item.due) {
    const hard = item.due.kind === "hard";
    dates.push({
      kind: hard ? "hard" : "target",
      label: hard ? "Hard deadline" : "Target date",
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
  if (item.review_on) {
    dates.push({ kind: "review", label: "Review", start: item.review_on });
  }
  return dates;
}
