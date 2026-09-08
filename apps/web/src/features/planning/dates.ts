export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  const result = value.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result))
    throw new Error("Date is outside the supported calendar.");
  return result;
}
export function shiftedSchedule(
  schedule: { start: string; end: string },
  days: number,
  operation: "move" | "start" | "end",
) {
  const start =
    operation === "end" ? schedule.start : shiftDate(schedule.start, days);
  const end =
    operation === "start" ? schedule.end : shiftDate(schedule.end, days);
  if (start > end)
    return operation === "start" ? { start: end, end } : { start, end: start };
  return { start, end };
}
export function dayDistance(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
}
