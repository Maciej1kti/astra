<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import ChartDashboard from "./ChartDashboard.svelte";
  import ChartTileDialog from "./ChartTileDialog.svelte";
  import { ChartData, type ChartDataState } from "./chart-data";
  import { chartSeriesKey, type ChartSummaryRow } from "./chart-model";
  import { tileSelection, withTileSelection } from "./chart-tiles";
  import { command, type Summary } from "../../lib/api/api";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { getPreferences } from "../../lib/api/resources";
  import type { PreferencesResource } from "../../lib/contracts/api.generated";

  let {
    project,
    today,
    revision,
    preferenceKey,
    open,
  }: {
    project: string;
    today: string;
    revision: number;
    preferenceKey: string;
    open: (ref: Pick<Summary, "project_id" | "id" | "type">) => void;
  } = $props();
  const daysBefore = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().slice(0, 10);
  };
  let from = $state(untrack(() => daysBefore(today, 29)));
  let to = $state(untrack(() => today));
  let includeArchived = $state(false);
  let viewState = $state.raw<ChartDataState>();
  const owner = new ChartData((value) => (viewState = value));
  viewState = owner.state;
  function refresh() {
    return owner.refresh({ project, from, to, includeArchived });
  }
  $effect(() => {
    void project;
    void from;
    void to;
    void includeArchived;
    void revision;
    untrack(() => void refresh());
  });

  // Plugins and tile choices belong to the profile. A choice is saved against
  // the version read here, so a change made elsewhere is a conflict to resolve
  // by reading again, never an overwrite.
  let preferences = $state.raw<PreferencesResource | null>(null);
  let reading = 0;
  let disposed = false;
  async function readPreferences() {
    const current = ++reading;
    try {
      const value = await getPreferences({ fresh: true });
      if (current === reading && !disposed) preferences = value;
    } catch (cause) {
      if (current === reading && !disposed && editing)
        tileError = errorMessage(cause);
    }
  }
  // The workspace revision moves with every refresh, including the one that
  // follows a preference change made in Settings or by another client.
  $effect(() => {
    void revision;
    untrack(() => void readPreferences());
  });

  const operation = commandOperation();
  let editing = $state.raw<ChartSummaryRow | null>(null);
  let tileError = $state("");
  async function settle(action: "submit" | "status") {
    tileError = "";
    try {
      if (action === "status") await operation.confirm();
      else await operation.commit();
      editing = null;
      await readPreferences();
    } catch (cause) {
      tileError = errorMessage(cause);
    }
  }
  function saveTile(chosen: string[]) {
    if (!preferences || !editing || operation.pending) return;
    operation.prepare(
      command(
        "/api/v1/workspace/preferences",
        "PATCH",
        {
          preferences: {
            chart_tiles: withTileSelection(
              preferences.preferences.chart_tiles,
              chartSeriesKey(editing.source),
              chosen,
              viewState!.series.map(chartSeriesKey),
            ),
          },
        },
        preferences.version,
      ),
    );
    void settle("submit");
  }
  async function reloadPreferences() {
    tileError = "";
    await readPreferences();
    operation.acknowledge();
  }
  onDestroy(() => {
    disposed = true;
    owner.dispose();
  });
</script>

<ChartDashboard
  series={viewState!.series}
  {today}
  {from}
  {to}
  {includeArchived}
  {preferenceKey}
  plugins={preferences?.preferences.plugins ?? []}
  tiles={preferences?.preferences.chart_tiles}
  loading={viewState!.loading}
  error={viewState!.error}
  notice={viewState!.notice}
  onrangechange={(start, end) => {
    from = start;
    to = end;
  }}
  onarchivedchange={(value) => (includeArchived = value)}
  onretry={() => void refresh()}
  onloadmore={viewState!.cursor ? () => void owner.more() : undefined}
  onconfigure={(row) => {
    tileError = "";
    editing = row;
  }}
/>
{#if editing}
  {@const row = editing}
  <ChartTileDialog
    {row}
    selection={tileSelection(
      preferences?.preferences.chart_tiles,
      chartSeriesKey(row.source),
    )}
    busy={operation.busy || !preferences}
    pending={operation.pending}
    conflict={operation.conflict}
    error={tileError}
    onsave={saveTile}
    onretry={() => void settle("submit")}
    oncheck={() => void settle("status")}
    onreload={() => void reloadPreferences()}
    onopen={() => {
      // Read the source before the tile is released.
      const { project_id, card_id: id } = row.source;
      editing = null;
      open({ project_id, id, type: "card" });
    }}
    onclose={() => {
      if (operation.conflict) operation.acknowledge();
      editing = null;
    }}
  />
{/if}
