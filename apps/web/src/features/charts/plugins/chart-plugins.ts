import type { Component } from "svelte";
import type { ChartSummaryRow } from "../chart-model.ts";
import ChartSettlement from "./settlement/ChartSettlement.svelte";
import ChartTotals from "./totals/ChartTotals.svelte";

/** Everything a Chart plugin may read: the selected counters, never the API. */
export interface ChartPluginContext {
  /** Selected counters with their range statistics, rate and history totals. */
  rows: ChartSummaryRow[];
  outputUnit: string;
}

/**
 * A Chart plugin fills named places of the view. It derives what it shows
 * from the context alone and writes nothing.
 */
export interface ChartPlugin {
  /** Identifier in the profile's `plugins` preference and in the registry. */
  id: string;
  /** Above the counter list and the plots. */
  panel?: Component<ChartPluginContext>;
  /** Below the summary tiles. */
  summary?: Component<ChartPluginContext>;
}

export const chartPlugins: readonly ChartPlugin[] = [
  { id: "chart-settlement", panel: ChartSettlement },
  { id: "chart-totals", summary: ChartTotals },
];

export function enabledChartPlugins(ids: readonly string[]): ChartPlugin[] {
  return chartPlugins.filter((plugin) => ids.includes(plugin.id));
}
