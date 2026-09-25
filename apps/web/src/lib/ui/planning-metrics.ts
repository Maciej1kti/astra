/** Pixel dimensions required by the planning widgets' public APIs. */
export const timelineMetrics = {
  compactWidth: 650,
  compactGrid: 170,
  grid: 230,
  startColumn: 100,
  endColumn: 110,
  day: 48,
  compactDay: 144,
  week: 140,
  month: 160,
  row: 60,
  scale: 32,
} as const;
export const compactCalendarQuery = "(max-width: 720px)";
