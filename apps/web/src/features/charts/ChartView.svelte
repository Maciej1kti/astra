<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import ChartDashboard from "./ChartDashboard.svelte";
  import { ChartData, type ChartDataState } from "./chart-data";
  import type { Summary } from "../../lib/api/api";

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
  const defaultFrom = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - 29);
    return value.toISOString().slice(0, 10);
  };
  let from = $state(untrack(() => defaultFrom(today)));
  let to = $state(untrack(() => today));
  let includeArchived = $state(false);
  // eslint-disable-next-line no-useless-assignment -- the reader below needs this binding before the owner that supplies its first value exists
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
  onDestroy(() => owner.dispose());
</script>

<ChartDashboard
  series={viewState!.series}
  {today}
  {from}
  {to}
  {includeArchived}
  {preferenceKey}
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
  onopen={(series) =>
    open({ project_id: series.project_id, id: series.card_id, type: "card" })}
/>
