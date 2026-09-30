/** Civil dates only: calendar navigation must not inherit the browser's timezone. */
export function validCalendarDate(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function calendarShift(value: string, days: number): string | null {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const result = date.toISOString().slice(0, 10);
  return validCalendarDate(result) ? result : null;
}
export function calendarMonth(value: string, amount: number): string | null {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  const result = date.toISOString().slice(0, 10);
  return validCalendarDate(result) ? result : null;
}
export function calendarCells(
  month: string,
  weekStart: string,
): (string | null)[] {
  const first = `${month.slice(0, 7)}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const offset = (weekday - (weekStart === "sunday" ? 0 : 1) + 7) % 7;
  return Array.from({ length: 42 }, (_, index) =>
    calendarShift(first, index - offset),
  );
}
export function calendarRange(
  start: string,
  end: string,
  selected: string,
  target: "start" | "end",
  single: boolean,
) {
  if (single) return { start: selected, end: selected };
  if (target === "start")
    return { start: selected, end: !end || end < selected ? selected : end };
  return !start || selected < start
    ? { start: selected, end: start || selected }
    : { start, end: selected };
}
export function calendarLabel(value: string, full = false): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    ...(full ? ({ weekday: "long", year: "numeric" } as const) : {}),
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}
