import { isCivilDate } from "../../lib/ui/calendar-dates.ts";

/**
 * Conversions between civil dates and the widgets' local Date objects. Kept
 * apart from the planning adapters because route parsing needs only these.
 */

/** Widget Date objects carry local calendar fields, never canonical timestamps. */
export function widgetDate(day: string): Date {
  // A malformed day yields an invalid Date, which `dateOnly` refuses.
  const [y = NaN, m = NaN, d = NaN] = day.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function dateOnly(date: Date): string {
  const value = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()))
    throw new Error("Data wykracza poza obsługiwany kalendarz.");
  return value;
}
/** A civil date that this browser's local calendar can also represent for the widgets. */
export function isCalendarDate(value: string): boolean {
  if (!isCivilDate(value)) return false;
  try {
    return dateOnly(widgetDate(value)) === value;
  } catch {
    return false;
  }
}
