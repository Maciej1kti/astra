import { countedDays } from "../../lib/ui/locale.ts";
import { chartDate, chartValue, type ChartSummaryRow } from "./chart-model.ts";

/** A value a summary tile can show. Identifiers are stored in preferences. */
export interface TileMetric {
  id: string;
  label: string;
  /** What the choice dialog says the value is. */
  hint: string;
}

export const tileMetrics: readonly TileMetric[] = [
  { id: "total", label: "Suma", hint: "Suma zapisów w wybranym okresie" },
  {
    id: "history-total",
    label: "Suma od początku",
    hint: "Suma wszystkich zapisów licznika",
  },
  {
    id: "recorded",
    label: "Dni z zapisami",
    hint: "Liczba dni z zapisem w okresie",
  },
  {
    id: "average",
    label: "Średnia na dzień",
    hint: "Średnia z dni, w których jest zapis",
  },
  {
    id: "daily-average",
    label: "Średnia dzienna okresu",
    hint: "Suma podzielona przez wszystkie dni okresu",
  },
  {
    id: "peak",
    label: "Najlepszy dzień",
    hint: "Najwyższy zapis w okresie i jego data",
  },
  {
    id: "last",
    label: "Ostatni zapis",
    hint: "Ostatni zapis w okresie i jego data",
  },
  {
    id: "difference",
    label: "Różnica",
    hint: "Różnica sumy wobec pierwszego licznika o tej samej jednostce",
  },
  { id: "rate", label: "Stawka", hint: "Stawka zapisana w liczniku" },
  {
    id: "value",
    label: "Wartość",
    hint: "Suma w okresie pomnożona przez stawkę",
  },
  {
    id: "history-value",
    label: "Wartość od początku",
    hint: "Suma wszystkich zapisów pomnożona przez stawkę",
  },
];

export const defaultTileMetrics: readonly string[] = [
  "total",
  "recorded",
  "average",
  "peak",
  "rate",
  "value",
];

/** The saved choice in the catalogue's order, or the default without one. */
export function tileSelection(
  saved: Record<string, string[]> | undefined,
  key: string,
): string[] {
  const chosen = saved?.[key] ?? defaultTileMetrics;
  return tileMetrics
    .map((metric) => metric.id)
    .filter((id) => chosen.includes(id));
}

/**
 * The whole map to store after one counter's choice changes. The default
 * choice is stored as no entry, and entries of counters that are no longer in
 * the catalogue are dropped once the map reaches its bound.
 */
export function withTileSelection(
  saved: Record<string, string[]> | undefined,
  key: string,
  chosen: string[],
  known: readonly string[],
): Record<string, string[]> {
  const next = { ...saved };
  const ordered = tileSelection({ [key]: chosen }, key);
  if (ordered.join() === defaultTileMetrics.join()) delete next[key];
  else next[key] = ordered;
  const keys = Object.keys(next);
  if (keys.length > 200)
    for (const other of keys)
      if (!known.includes(other) && Object.keys(next).length > 200)
        delete next[other];
  return next;
}

export interface TileValue {
  value: string;
  note: string;
}

/** Every value of one counter, formatted; a tile shows the chosen ones. */
export function tileValues(
  row: ChartSummaryRow,
  rows: ChartSummaryRow[],
  days: number,
  outputUnit: string,
): Record<string, TileValue> {
  const { source, stats, rate } = row;
  const unit = source.unit;
  const money = outputUnit.trim() || "wartość";
  const history = source.history;
  const sameUnit = rows.filter((other) => other.source.unit === unit);
  const baseline = sameUnit[0];
  const difference =
    baseline && baseline !== row && stats.recorded && baseline.stats.recorded
      ? stats.total - baseline.stats.total
      : null;
  const none = "—";
  return {
    total: {
      value: stats.recorded ? chartValue(stats.total) : none,
      note: unit,
    },
    "history-total": {
      value: history?.recorded ? chartValue(history.total) : none,
      note: history?.first_date
        ? `${unit} od ${chartDate(history.first_date, true)}`
        : "Brak zapisów",
    },
    recorded: {
      value: chartValue(stats.recorded),
      note: `z ${countedDays(days)}`,
    },
    average: { value: chartValue(stats.average), note: unit },
    "daily-average": {
      value: stats.recorded && days ? chartValue(stats.total / days) : none,
      note: `${unit} na dzień`,
    },
    peak: {
      value: chartValue(stats.peak),
      note: stats.peakDate ? chartDate(stats.peakDate) : "Brak zapisów",
    },
    last: {
      value: chartValue(stats.lastValue),
      note: stats.lastDate ? chartDate(stats.lastDate) : "Brak zapisów",
    },
    difference: {
      value:
        difference === null
          ? none
          : `${difference > 0 ? "+" : ""}${chartValue(difference)} ${unit}`,
      note:
        sameUnit.length < 2
          ? "Jedyny w tej jednostce"
          : baseline === row
            ? "Punkt odniesienia"
            : difference === null
              ? "Brak zapisów do porównania"
              : `wobec: ${baseline?.source.name}`,
    },
    rate: {
      value: rate === null ? none : chartValue(rate),
      note:
        rate === null ? "Ustaw w liczniku" : `${money} za ${unit || "jedn."}`,
    },
    value: {
      value:
        rate !== null && stats.recorded ? chartValue(stats.total * rate) : none,
      note: rate === null ? "Bez stawki" : money,
    },
    "history-value": {
      value:
        rate !== null && history?.recorded
          ? chartValue(history.total * rate)
          : none,
      note: rate === null ? "Bez stawki" : `${money} od początku`,
    },
  };
}
