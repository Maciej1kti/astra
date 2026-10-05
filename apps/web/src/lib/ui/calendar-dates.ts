/** Civil dates only: calendar navigation must not inherit the browser's timezone. */

/** A real day in the YYYY-MM-DD form the server accepts, year zero included. */
export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
/** A civil date that calendar grids and pickers can show: they start at year one. */
export function validCalendarDate(value: string): boolean {
  return !value.startsWith("0000") && isCivilDate(value);
}
/** Whole civil days from one date to another; negative when `to` is earlier. */
export function dayDistance(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
}
/** The civil day in a timezone, independent of the browser's zone and locale. */
export function calendarToday(timezone: string, now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
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
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "UTC",
    ...(full ? ({ weekday: "long", year: "numeric" } as const) : {}),
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}
