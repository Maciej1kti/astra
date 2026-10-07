import { dayDistance, validCalendarDate } from "../../lib/ui/calendar-dates.ts";
import { calendarShift } from "../../lib/ui/calendar-grid.ts";

export interface ChartSeries {
  project_id: string;
  project_name: string;
  card_id: string;
  card_title: string;
  id: string;
  name: string;
  unit: string;
  archived: boolean;
  project_archived?: boolean;
  card_archived?: boolean;
  availability?: "ready" | "stale";
  version?: string;
  step?: number;
  values: Record<string, number>;
}
export type ChartBucket = "day" | "week" | "month";
export interface ChartPeriod {
  from: string;
  to: string;
  days: number;
}
export interface ChartPoint extends ChartPeriod {
  value: number | null;
  recorded: number;
  /** A running total held through a period without a recording. */
  carried: number | null;
}
export interface ChartStats {
  total: number;
  recorded: number;
  positive: number;
  average: number | null;
  peak: number | null;
  peakDate: string | null;
  lastDate: string | null;
  lastValue: number | null;
}
export interface ChartPlotSeries {
  source: ChartSeries;
  points: ChartPoint[];
  color: number;
}
export interface ChartPanel {
  unit: string;
  series: ChartPlotSeries[];
}
/** One selected counter over the whole range, whatever the plot shows. */
export interface ChartSummaryRow {
  source: ChartSeries;
  stats: ChartStats;
  rate: number | null;
  color: number;
}

export function chartSeriesKey(series: ChartSeries): string {
  return `${series.project_id}/${series.card_id}/${series.id}`;
}

/** API and UI use inclusive civil-date ranges, independent of browser timezone. */
export function chartRangeDays(from: string, to: string): number {
  if (!validCalendarDate(from) || !validCalendarDate(to) || to < from) return 0;
  return dayDistance(from, to) + 1;
}

export function chartPeriods(
  from: string,
  to: string,
  bucket: ChartBucket,
): ChartPeriod[] {
  const days = chartRangeDays(from, to);
  if (!days || days > 400) return [];
  const periods: ChartPeriod[] = [];
  let date: string | null = from;
  while (date && date <= to) {
    let end = date;
    if (bucket === "week") {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      end = calendarShift(date, (7 - weekday) % 7) ?? date;
    } else if (bucket === "month") {
      const month = new Date(`${date}T12:00:00Z`);
      month.setUTCMonth(month.getUTCMonth() + 1, 0);
      end = month.toISOString().slice(0, 10);
    }
    if (end > to) end = to;
    periods.push({ from: date, to: end, days: chartRangeDays(date, end) });
    date = calendarShift(end, 1);
  }
  return periods;
}

export function chartStats(
  values: Record<string, number>,
  from: string,
  to: string,
): ChartStats {
  const entries = Object.entries(values)
    .filter(
      ([date, value]) =>
        date >= from &&
        date <= to &&
        validCalendarDate(date) &&
        Number.isFinite(value),
    )
    .sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const peak = entries.reduce<[string, number] | null>(
    (best, entry) => (!best || entry[1] > best[1] ? entry : best),
    null,
  );
  const last = entries.at(-1);
  return {
    total,
    recorded: entries.length,
    positive: entries.filter(([, value]) => value > 0).length,
    average: entries.length ? total / entries.length : null,
    peak: peak?.[1] ?? null,
    peakDate: peak?.[0] ?? null,
    lastDate: last?.[0] ?? null,
    lastValue: last?.[1] ?? null,
  };
}

/** Empty buckets remain missing. An explicit zero is a recorded data point. */
export function chartPoints(
  values: Record<string, number>,
  periods: ChartPeriod[],
  cumulative = false,
): ChartPoint[] {
  let running = 0;
  let seen = false;
  return periods.map((period) => {
    let total = 0;
    let recorded = 0;
    for (const [date, value] of Object.entries(values)) {
      if (
        date >= period.from &&
        date <= period.to &&
        validCalendarDate(date) &&
        Number.isFinite(value)
      ) {
        total += value;
        recorded++;
      }
    }
    running += total;
    seen ||= recorded > 0;
    return {
      ...period,
      recorded,
      value: recorded ? (cumulative ? running : total) : null,
      carried: cumulative && seen ? running : null,
    };
  });
}

/** Empty input means no conversion has been chosen; zero remains a valid rate. */
export function chartRate(raw: string | undefined): number | null {
  if (!raw?.trim() || !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw.trim()))
    return null;
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000_000
    ? value
    : null;
}

/** A counter keeps its colour while the selection around it changes. */
export function chartColorSlots(
  previous: Record<string, number>,
  keys: string[],
): Record<string, number> {
  const slots: Record<string, number> = {};
  const taken = new Set<number>();
  for (const key of keys) {
    const slot = previous[key];
    if (slot !== undefined && !taken.has(slot)) {
      slots[key] = slot;
      taken.add(slot);
    }
  }
  let next = 0;
  for (const key of keys) {
    if (slots[key] !== undefined) continue;
    while (taken.has(next)) next++;
    slots[key] = next;
    taken.add(next);
  }
  return slots;
}

/** Counters share a plot only when their units match. */
export function chartPanels(
  series: ChartSeries[],
  periods: ChartPeriod[],
  cumulative: boolean,
  colors: Record<string, number> = {},
): ChartPanel[] {
  const panels = new Map<string, ChartPlotSeries[]>();
  for (const [position, source] of series.entries()) {
    const unit = source.unit.trim() || "units";
    const row = {
      source,
      points: chartPoints(source.values, periods, cumulative),
      color: colors[chartSeriesKey(source)] ?? position,
    };
    if (!panels.has(unit)) panels.set(unit, []);
    panels.get(unit)!.push(row);
  }
  return [...panels].map(([unit, rows]) => ({ unit, series: rows }));
}

export function chartValue(value: number | null, compact = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 2,
    ...(compact ? ({ notation: "compact" } as const) : {}),
  }).format(value);
}

export function chartDate(value: string, full = false): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(full ? ({ year: "numeric" } as const) : {}),
  }).format(new Date(`${value}T12:00:00Z`));
}

export function chartDomain(panel: ChartPanel): { min: number; max: number } {
  const values = panel.series.flatMap((row) =>
    row.points.map((point) => point.value ?? 0),
  );
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  return { min, max: max === min ? min + 1 : max };
}

/** Round axis steps, so gridlines land on values a reader can name. */
export function chartTicks(min: number, max: number, target = 4): number[] {
  const rough = (max - min || 1) / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5].map((factor) => factor * power).find((size) => size >= rough) ??
    10 * power;
  const first = Math.floor(min / step);
  const last = Math.max(first + 1, Math.ceil(max / step));
  return Array.from({ length: last - first + 1 }, (_, index) =>
    Number(((first + index) * step).toPrecision(12)),
  );
}

/** The plotting area inside an SVG whose user units are CSS pixels. */
export interface ChartFrame {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export function chartFrame(width: number, height: number): ChartFrame {
  const compact = width < 550;
  return {
    left: compact ? 44 : 56,
    right: width - (compact ? 12 : 16),
    top: 12,
    bottom: height - 30,
  };
}
/** Every period owns an equal band; marks sit at its centre. */
export function chartBand(count: number, frame: ChartFrame): number {
  return (frame.right - frame.left) / Math.max(1, count);
}
export function chartX(
  index: number,
  count: number,
  frame: ChartFrame,
): number {
  return frame.left + (index + 0.5) * chartBand(count, frame);
}
export function chartY(
  value: number,
  min: number,
  max: number,
  frame: ChartFrame,
): number {
  return (
    frame.bottom - ((value - min) / (max - min)) * (frame.bottom - frame.top)
  );
}
export function chartIndex(
  x: number,
  count: number,
  frame: ChartFrame,
): number {
  const index = Math.floor((x - frame.left) / chartBand(count, frame));
  return Math.min(Math.max(0, index), Math.max(0, count - 1));
}

/**
 * Every recording is a point and consecutive recordings are joined, so the
 * line spans periods without one; only a point marks a recording.
 */
export function chartLine(
  points: ChartPoint[],
  min: number,
  max: number,
  frame: ChartFrame,
): string {
  let connected = false;
  return points
    .map((point, index) => {
      if (point.value === null) return "";
      const x = chartX(index, points.length, frame);
      const y = chartY(point.value, min, max, frame);
      const command = connected ? "L" : "M";
      connected = true;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
}

export interface ChartPreferences {
  rates: Record<string, string>;
  outputUnit: string;
}
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
const storageKey = (scope: string) => `astra-counter-charts:v1:${scope}`;

export function readChartPreferences(
  scope: string,
  storage?: StorageReader,
): ChartPreferences {
  try {
    const value: unknown = JSON.parse(
      (storage ?? localStorage).getItem(storageKey(scope)) ?? "null",
    );
    if (value && typeof value === "object") {
      const raw = value as { rates?: unknown; outputUnit?: unknown };
      const rates = Object.fromEntries(
        raw.rates && typeof raw.rates === "object" && !Array.isArray(raw.rates)
          ? Object.entries(raw.rates).filter(
              ([key, rate]) =>
                key.length < 200 &&
                typeof rate === "string" &&
                rate.length <= 40 &&
                chartRate(rate) !== null,
            )
          : [],
      );
      return {
        rates,
        outputUnit:
          typeof raw.outputUnit === "string"
            ? raw.outputUnit.slice(0, 12)
            : "PLN",
      };
    }
  } catch {
    /* Storage can be disabled; visualization still works. */
  }
  return { rates: {}, outputUnit: "PLN" };
}

export function writeChartPreferences(
  scope: string,
  value: ChartPreferences,
  storage?: StorageWriter,
): boolean {
  try {
    (storage ?? localStorage).setItem(storageKey(scope), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
