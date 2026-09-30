import { calendarShift } from "../../lib/ui/calendar-dates.ts";

/** Fixed calendar window; missing entries stay distinct from recorded zero. */
export function counterTrend(values: Record<string, number>, today: string) {
  return Array.from({ length: 14 }, (_, index) => {
    const date = calendarShift(today, index - 13);
    return { date, value: date ? (values[date] ?? null) : null };
  });
}
