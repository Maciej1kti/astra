import type { ChartSummaryRow } from "../../chart-model.ts";

export interface ChartTotals {
  /** Sum of the selected counters, when they all share one unit. */
  total: number | null;
  unit: string;
  /** Recorded days across the selected counters. */
  records: number;
  /** Sum of total times rate over the counters that have a rate. */
  converted: number | null;
  rated: number;
  counters: number;
}

/** What the selected counters add up to in the plotted range. */
export function chartTotals(rows: ChartSummaryRow[]): ChartTotals {
  const units = [...new Set(rows.map((row) => row.source.unit.trim()))];
  const records = rows.reduce((sum, row) => sum + row.stats.recorded, 0);
  const rated = rows.filter((row) => row.rate !== null);
  return {
    total:
      units.length === 1 && records > 0
        ? rows.reduce((sum, row) => sum + row.stats.total, 0)
        : null,
    unit: units.length === 1 ? units[0]! : "",
    records,
    converted: rated.some((row) => row.stats.recorded > 0)
      ? rated.reduce((sum, row) => sum + row.stats.total * (row.rate ?? 0), 0)
      : null,
    rated: rated.length,
    counters: rows.length,
  };
}
