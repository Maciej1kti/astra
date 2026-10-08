<script lang="ts">
  import "../../styles/series.css";
  import { revealLayers } from "../../lib/ui/motion-layers";
  import { chartLayers } from "./chart-motion";
  import { onMount } from "svelte";
  import PageHeading from "../../lib/ui/PageHeading.svelte";
  import EmptyState from "../../lib/ui/EmptyState.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import { countedDays } from "../../lib/ui/locale.ts";
  import ChartCounterPicker from "./ChartCounterPicker.svelte";
  import ChartMenu from "./ChartMenu.svelte";
  import ChartPlot from "./ChartPlot.svelte";
  import ChartRange from "./ChartRange.svelte";
  import Segments from "../../lib/ui/Segments.svelte";
  import { enabledChartPlugins } from "./plugins/chart-plugins";
  import ChartSummary from "./ChartSummary.svelte";
  import {
    chartColorSlots,
    chartDate,
    chartPanels,
    chartPeriods,
    chartRangeDays,
    chartRate,
    chartSeriesKey,
    chartStats,
    readChartPreferences,
    writeChartPreferences,
    type ChartBucket,
    type ChartSeries,
    type ChartSummaryRow,
  } from "./chart-model";

  let {
    series,
    from,
    to,
    today,
    loading = false,
    error = "",
    notice = "",
    includeArchived,
    preferenceKey,
    plugins,
    tiles,
    onconfigure,
    onrangechange,
    onarchivedchange,
    onretry,
    onloadmore,
  }: {
    series: ChartSeries[];
    from: string;
    to: string;
    today: string;
    loading?: boolean;
    error?: string;
    notice?: string;
    includeArchived: boolean;
    preferenceKey: string;
    /** Identifiers of the plugins this profile has switched on. */
    plugins: readonly string[];
    /** Saved tile value choices by counter key. */
    tiles: Record<string, string[]> | undefined;
    onconfigure: (row: ChartSummaryRow) => void;
    onrangechange: (from: string, to: string) => void;
    onarchivedchange: (include: boolean) => void;
    onretry: () => void;
    onloadmore?: () => void;
  } = $props();

  const selectionLimit = 8;
  // The first read starts after mount; content enters once it has arrived.
  let reading = $state(false);
  $effect(() => {
    if (loading) reading = true;
  });

  let selectedKeys = $state<string[]>([]);
  let colors = $state<Record<string, number>>({});
  let initialized = $state(false);
  let loadedPreferenceKey = $state<string | null>(null);
  let bucket = $state<ChartBucket>("day");
  /** Until a grouping is picked, it follows the length of the range. */
  let bucketChosen = false;
  let cumulative = $state(false);
  let outputUnit = $state("PLN");
  let storageMessage = $state("");
  // The shell's phone layout: display controls move below the plot.
  const phoneQuery = "(max-width: 700px)";
  let phone = $state(matchMedia(phoneQuery).matches);
  onMount(() => {
    const query = matchMedia(phoneQuery);
    const update = () => (phone = query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });

  const buckets: { value: ChartBucket; label: string }[] = [
    { value: "day", label: "Dni" },
    { value: "week", label: "Tygodnie" },
    { value: "month", label: "Miesiące" },
  ];
  const totals = [
    { value: "period", label: "Sumy okresów" },
    { value: "running", label: "Narastająco" },
  ];

  function select(keys: string[]) {
    selectedKeys = keys;
    colors = chartColorSlots(colors, keys);
  }
  $effect(() => {
    if (loadedPreferenceKey !== preferenceKey) {
      const preferences = readChartPreferences(preferenceKey);
      outputUnit = preferences.outputUnit;
      select([]);
      initialized = false;
      loadedPreferenceKey = preferenceKey;
    }
  });
  $effect(() => {
    if (!initialized && series.length) {
      select(series.slice(0, 4).map(chartSeriesKey));
      initialized = true;
    }
  });

  const selected = $derived(
    series.filter((item) => selectedKeys.includes(chartSeriesKey(item))),
  );
  const periods = $derived(chartPeriods(from, to, bucket));
  const panels = $derived(chartPanels(selected, periods, cumulative, colors));
  const rows = $derived(
    selected.map((source, position) => ({
      source,
      stats: chartStats(source.values, from, to),
      rate: chartRate(source.rate),
      color: colors[chartSeriesKey(source)] ?? position,
    })),
  );
  const active = $derived(enabledChartPlugins(plugins));
  const records = $derived(
    rows.reduce((sum, row) => sum + row.stats.recorded, 0),
  );
  const units = $derived([
    ...new Set(selected.map((item) => item.unit.trim() || "units")),
  ]);
  const days = $derived(chartRangeDays(from, to));

  function toggleSeries(item: ChartSeries) {
    const key = chartSeriesKey(item);
    const available = new Set(series.map(chartSeriesKey));
    const retained = selectedKeys.filter((value) => available.has(value));
    select(
      retained.includes(key)
        ? retained.filter((value) => value !== key)
        : [...retained, key].slice(0, selectionLimit),
    );
  }
  function changeRange(start: string, end: string) {
    if (!bucketChosen) {
      const count = chartRangeDays(start, end);
      bucket = count > 180 ? "month" : count > 45 ? "week" : "day";
    }
    onrangechange(start, end);
  }
  function chooseBucket(value: ChartBucket) {
    bucket = value;
    bucketChosen = true;
  }
  function chooseTotals(value: string) {
    cumulative = value === "running";
  }
  function savePreferences() {
    storageMessage = writeChartPreferences(preferenceKey, { outputUnit })
      ? ""
      : "Pamięć przeglądarki jest niedostępna. Jednostka wynikowa zostanie zachowana tylko na czas tej wizyty.";
  }
</script>

<section
  class="chart-dashboard"
  aria-label="Panel liczników"
  data-chart-from={from}
  data-chart-to={to}
  use:revealLayers={{
    key: preferenceKey,
    ready: reading && !loading,
    layers: chartLayers,
  }}
>
  {#snippet period()}
    <p class="chart-period">
      <span>{chartDate(from)} – {chartDate(to, true)}</span>
      <span>{countedDays(days)}</span>
      <span class="chart-loading" role="status"
        >{loading ? "Ładowanie historii liczników…" : ""}</span
      >
    </p>
  {/snippet}

  <PageHeading title="Wykres"
    >{#if !phone}<ChartRange
        {from}
        {to}
        {today}
        onrangechange={changeRange}
      />{/if}</PageHeading
  >

  {#if !phone}
    <div class="chart-options">
      <Segments
        label="Grupuj według"
        options={buckets}
        value={bucket}
        onselect={chooseBucket}
      />
      <Segments
        label="Sumy na wykresie"
        options={totals}
        value={cumulative ? "running" : "period"}
        onselect={chooseTotals}
      />
      {@render period()}
    </div>
  {/if}

  {#if error}<div class="notice">
      <span role="alert">{error}</span><Button
        onclick={onretry}
        disabled={loading}>Spróbuj ponownie</Button
      >
    </div>{/if}
  {#if notice}<p class="notice">{notice}</p>{/if}

  {#if rows.length}
    {#each active as plugin (plugin.id)}
      {#if plugin.panel}<plugin.panel {rows} {outputUnit} />{/if}
    {/each}
  {/if}

  <div class="chart-body">
    <ChartCounterPicker
      {series}
      {selectedKeys}
      {colors}
      {from}
      {to}
      limit={selectionLimit}
      {loading}
      {includeArchived}
      ontoggle={toggleSeries}
      onclear={() => select([])}
      {onarchivedchange}
      {onloadmore}
    />

    <div class="chart-workspace" aria-busy={loading}>
      {#if selected.length && records === 0}
        <EmptyState
          ><strong>Brak zapisów w tym zakresie dat.</strong>
          <p>
            Wybierz inny zakres lub zapisz wynik licznika na jego karcie.
          </p></EmptyState
        >
      {:else if panels.length}
        <div class="chart-panels" class:refreshing={loading}>
          {#each panels as panel (panel.unit)}<ChartPlot
              {panel}
              {cumulative}
              {bucket}
            />{/each}
        </div>
      {:else}<EmptyState
          ><strong
            >{series.length
              ? "Wybierz liczniki, aby rozpocząć porównanie."
              : loading
                ? "Wczytywanie liczników…"
                : "Tutaj pojawią się Twoje liczniki."}</strong
          >
          <p>
            {series.length
              ? "Zaznacz liczniki na liście, aby zobaczyć ich historię i statystyki."
              : loading
                ? "Czytam zapisaną historię z wybranego projektu."
                : "Dodaj licznik do karty i zapisz wynik. Jego dzienna historia pojawi się tutaj."}
          </p></EmptyState
        >{/if}
      {#if phone}
        <div class="chart-controls">
          <ChartRange compact {from} {to} {today} onrangechange={changeRange}>
            <ChartMenu
              label="Grupuj według"
              options={buckets}
              value={bucket}
              onselect={chooseBucket}
            />
            <ChartMenu
              label="Sumy na wykresie"
              options={totals}
              value={cumulative ? "running" : "period"}
              text={cumulative ? undefined : "Sumy"}
              onselect={chooseTotals}
            />
          </ChartRange>
          {@render period()}
        </div>
      {/if}
      {#if panels.length && records > 0}
        <p class="chart-note">
          {#if units.length > 1}Każda jednostka ma własny wykres i własną skalę.{/if}
          {#if cumulative}Suma narastająca liczy od początku zakresu.{/if}
          Punkt oznacza zapis, także zapisane zero. Linia łączy kolejne zapisy, a
          okres bez zapisu nie ma punktu.
          {#if bucket === "week"}Tygodnie zaczynają się w poniedziałek.{/if}
        </p>
      {/if}
    </div>
  </div>

  {#if selected.length}
    <ChartSummary
      {rows}
      {days}
      {tiles}
      {outputUnit}
      onoutputunit={(value) => {
        outputUnit = value;
        savePreferences();
      }}
      {onconfigure}
    >
      {#snippet footer()}
        {#each active as plugin (plugin.id)}
          {#if plugin.summary}<plugin.summary {rows} {outputUnit} />{/if}
        {/each}
      {/snippet}
    </ChartSummary>

    {#if storageMessage}<p role="status" class="notice">
        {storageMessage}
      </p>{/if}
  {/if}
</section>

<style>
  .chart-dashboard {
    container: chart / inline-size;
    min-width: 0;
  }
  .chart-dashboard :global(.heading) {
    align-items: start;
  }
  .chart-options {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-6);
    margin-bottom: var(--space-8);
  }
  .chart-period {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0 var(--space-6);
    margin: 0 0 0 auto;
    color: var(--muted);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
  }
  .chart-period span:first-child {
    color: var(--ink);
  }
  .chart-loading:empty {
    display: none;
  }
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    margin: 0 0 var(--space-8);
  }
  .chart-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-6);
    align-items: start;
  }
  /* The picker becomes a side rail once the plot keeps a useful width. */
  @container chart (min-width: 940px) {
    .chart-body {
      grid-template-columns: var(--panel-width) minmax(0, 1fr);
      gap: var(--space-9);
    }
  }
  .chart-workspace {
    min-width: 0;
  }
  .chart-panels {
    display: grid;
    gap: var(--space-6);
    transition: opacity var(--motion-quick) var(--motion-ease);
  }
  /* A refresh keeps the previous plot in place instead of clearing it. */
  .chart-panels.refreshing {
    opacity: var(--pending-opacity);
  }
  .chart-controls {
    display: grid;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }
  .chart-controls .chart-period {
    justify-content: flex-start;
    margin: 0;
    font-size: var(--text-sm);
  }
  .chart-note {
    max-width: var(--measure);
    margin: var(--space-6) 0 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  :global(.chart-dashboard .series-color-0) {
    --series-color: var(--series-1);
  }
  :global(.chart-dashboard .series-color-1) {
    --series-color: var(--series-2);
  }
  :global(.chart-dashboard .series-color-2) {
    --series-color: var(--series-3);
  }
  :global(.chart-dashboard .series-color-3) {
    --series-color: var(--series-4);
  }
  :global(.chart-dashboard .series-color-4) {
    --series-color: var(--series-5);
  }
  :global(.chart-dashboard .series-color-5) {
    --series-color: var(--series-6);
  }
  :global(.chart-dashboard .series-color-6) {
    --series-color: var(--series-7);
  }
  :global(.chart-dashboard .series-color-7) {
    --series-color: var(--series-8);
  }
  @container chart (max-width: 400px) {
    .chart-dashboard :global(.segments) {
      --segments-inline: var(--space-2);
    }
  }
  @container chart (max-width: 620px) {
    .chart-dashboard :global(.heading) {
      flex-wrap: wrap;
      gap: var(--space-6);
    }
    .chart-options {
      gap: var(--space-4);
    }
    .chart-period {
      flex-basis: 100%;
      justify-content: flex-start;
      margin: var(--space-2) 0 0;
      font-size: var(--text-sm);
    }
  }
  @container chart (max-width: 480px) {
    .chart-options > :global(*) {
      flex: 1 1 100%;
    }
  }
</style>
