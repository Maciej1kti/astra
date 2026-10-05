/**
 * Civil dates only: nothing here inherits the browser's timezone. Kept small,
 * because route parsing and the application clock load it with the first view.
 */

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
