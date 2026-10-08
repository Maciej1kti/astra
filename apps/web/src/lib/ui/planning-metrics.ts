/**
 * Pixel dimensions the timeline needs as numbers: it places days, bars and
 * gesture previews by arithmetic, and hands the same values to its styles.
 */
export const timelineMetrics = {
  /** Width of one day at each scale. */
  unit: { days: 40, weeks: 16, months: 4 },
  compactUnit: { days: 36, weeks: 14, months: 4 },
  /** The fixed column of row titles. */
  label: 248,
  compactLabel: 132,
  /** Below this container width the compact dimensions apply. */
  compactWidth: 650,
  /** A bar at least this wide carries its title inside. */
  titleInside: 88,
  /** A narrower bar has no room for the symbol of its kind either. */
  iconInside: 24,
  /** Space between a bar and the edges of its days, and its least width. */
  barGap: 2,
  barMin: 6,
  /** Days kept rendered on each side of the visible ones. */
  overscan: 21,
  /** Share of the visible days that precede today when the axis opens on it. */
  todayLead: 0.3,
  /** The most days that may precede it, however many are visible. */
  leadDays: 14,
  /** Milliseconds: keyboard steps rest this long before they are saved. */
  nudgeRest: 600,
  /** Milliseconds a row takes to reach its new place in the order. */
  reorder: 260,
} as const;
export const compactCalendarQuery = "(max-width: 700px)";
export const calendarMetrics = { compactHourColumn: 100 } as const;
