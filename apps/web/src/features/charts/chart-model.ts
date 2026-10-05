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
export type ChartScale = "values" | "relative" | "converted";
export interface ChartPeriod {
  from: string;
  to: string;
  days: number;
}
export interface ChartPoint extends ChartPeriod {
  value: number | null;
  recorded: number;
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
  stats: ChartStats;
  color: number;
  rate: number | null;
}
export interface ChartPanel {
  unit: string;
  series: ChartPlotSeries[];
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
    return {
      ...period,
      recorded,
      value: recorded ? (cumulative ? running : total) : null,
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

export function chartPanels(
  series: ChartSeries[],
  periods: ChartPeriod[],
  cumulative: boolean,
  scale: ChartScale,
  rates: Record<string, string>,
  outputUnit: string,
): ChartPanel[] {
  const panels = new Map<string, ChartPlotSeries[]>();
  for (const [color, source] of series.entries()) {
    const rate = chartRate(rates[chartSeriesKey(source)]);
    if (scale === "converted" && rate === null) continue;
    const points = chartPoints(source.values, periods, cumulative);
    const peak = Math.max(
      0,
      ...points.map((point) => Math.abs(point.value ?? 0)),
    );
    const transformed = points.map((point) => ({
      ...point,
      value:
        point.value === null
          ? null
          : scale === "relative"
            ? peak === 0
              ? 0
              : (point.value / peak) * 100
            : scale === "converted"
              ? point.value * (rate ?? 0)
              : point.value,
    }));
    const unit =
      scale === "relative"
        ? "% własnego maksimum"
        : scale === "converted"
          ? outputUnit.trim() || "value"
          : source.unit.trim() || "units";
    const row = {
      source,
      points: transformed,
      stats: chartStats(
        source.values,
        periods[0]?.from ?? "",
        periods.at(-1)?.to ?? "",
      ),
      color,
      rate,
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

/** Each gap starts a new segment, so the SVG cannot invent missing recordings. */
export function chartLine(
  points: ChartPoint[],
  min: number,
  max: number,
  width = 920,
): string {
  let connected = false;
  return points
    .map((point, index) => {
      if (point.value === null) {
        connected = false;
        return "";
      }
      const x = chartX(index, points.length, width);
      const y = chartY(point.value, min, max);
      const command = connected ? "L" : "M";
      connected = true;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
export function chartX(index: number, count: number, width = 920): number {
  const left = width < 550 ? 44 : 66;
  const right = width - (width < 550 ? 24 : 38);
  return count <= 1
    ? (left + right) / 2
    : left + (index / (count - 1)) * (right - left);
}
export function chartY(value: number, min: number, max: number): number {
  return 250 - ((value - min) / (max - min)) * 216;
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
