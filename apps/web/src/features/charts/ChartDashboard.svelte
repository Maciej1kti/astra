<script lang="ts">
  import PageHeading from "../../lib/ui/PageHeading.svelte";
  import EmptyState from "../../lib/ui/EmptyState.svelte";
  import { calendarShift } from "../../lib/ui/calendar-dates";
  import ChartPlot from "./ChartPlot.svelte";
  import {
    chartDate,
    chartPanels,
    chartPeriods,
    chartRangeDays,
    chartRate,
    chartSeriesKey,
    chartStats,
    chartValue,
    readChartPreferences,
    writeChartPreferences,
    type ChartBucket,
    type ChartScale,
    type ChartSeries,
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
    onrangechange,
    onarchivedchange,
    onretry,
    onopen,
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
    onrangechange: (from: string, to: string) => void;
    onarchivedchange: (include: boolean) => void;
    onretry: () => void;
    onopen: (series: ChartSeries) => void;
    onloadmore?: () => void;
  } = $props();

  let selectedKeys = $state<string[]>([]);
  let initialized = $state(false);
  let loadedPreferenceKey = $state<string | null>(null);
  let search = $state("");
  let bucket = $state<ChartBucket>("day");
  let cumulative = $state(false);
  let scale = $state<ChartScale>("values");
  let rates = $state<Record<string, string>>({});
  let outputUnit = $state("PLN");
  let storageMessage = $state("");
  let draftFrom = $state("");
  let draftTo = $state("");
  let rangeError = $state("");

  $effect(() => {
    if (loadedPreferenceKey !== preferenceKey) {
      const preferences = readChartPreferences(preferenceKey);
      rates = preferences.rates;
      outputUnit = preferences.outputUnit;
      selectedKeys = [];
      initialized = false;
      loadedPreferenceKey = preferenceKey;
    }
  });
  $effect(() => {
    if (!initialized && series.length) {
      selectedKeys = series.slice(0, 3).map(chartSeriesKey);
      initialized = true;
    }
  });
  $effect(() => {
    draftFrom = from;
    draftTo = to;
    rangeError = "";
  });

  const selected = $derived(
    series.filter((item) => selectedKeys.includes(chartSeriesKey(item))),
  );
  const filtered = $derived(
    series.filter((item) =>
      `${item.name} ${item.card_title} ${item.project_name} ${item.unit}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
  );
  const periods = $derived(chartPeriods(from, to, bucket));
  const panels = $derived(
    chartPanels(selected, periods, cumulative, scale, rates, outputUnit),
  );
  const stats = $derived(
    selected.map((source) => ({
      source,
      stats: chartStats(source.values, from, to),
      rate: chartRate(rates[chartSeriesKey(source)]),
    })),
  );
  const records = $derived(
    stats.reduce((sum, item) => sum + item.stats.recorded, 0),
  );
  const rated = $derived(stats.filter((row) => row.rate !== null));
  const ratedRecorded = $derived(rated.some((row) => row.stats.recorded > 0));
  const convertedTotal = $derived(
    rated.reduce((sum, row) => sum + row.stats.total * (row.rate ?? 0), 0),
  );
  const totalGroups = $derived([
    ...new Set(selected.map((item) => item.unit.trim() || "units")),
  ]);
  const days = $derived(chartRangeDays(from, to));
  const valueUnit = $derived(outputUnit.trim() || "value");

  function toggleSeries(item: ChartSeries) {
    const key = chartSeriesKey(item);
    const available = new Set(series.map(chartSeriesKey));
    const retained = selectedKeys.filter((value) => available.has(value));
    selectedKeys = retained.includes(key)
      ? retained.filter((value) => value !== key)
      : [...retained, key].slice(0, 8);
  }
  function applyRange() {
    const count = chartRangeDays(draftFrom, draftTo);
    if (!count || count > 400) {
      rangeError =
        "Choose a valid date range of up to 400 days. The end must follow the start.";
      return;
    }
    rangeError = "";
    onrangechange(draftFrom, draftTo);
  }
  function preset(count: number) {
    const start = calendarShift(today, 1 - count);
    if (start) onrangechange(start, today);
  }
  function savePreferences() {
    storageMessage = writeChartPreferences(preferenceKey, { rates, outputUnit })
      ? ""
      : "Browser storage is unavailable. Rates will last for this visit.";
  }
  function setRate(key: string, value: string) {
    rates = { ...rates, [key]: value };
    savePreferences();
  }
</script>

<section class="chart-dashboard" aria-label="Counter dashboard">
  <PageHeading title="Chart"
    ><p class="chart-intro">
      See your counters over time. Compare activity, explore trends and turn
      recorded units into a value.
    </p></PageHeading
  >

  <div class="range-toolbar">
    <div class="range-presets" role="group" aria-label="Date range shortcuts">
      {#each [7, 30, 90, 365] as count}
        <button
          class:active={from === calendarShift(today, 1 - count) &&
            to === today}
          aria-pressed={from === calendarShift(today, 1 - count) &&
            to === today}
          onclick={() => preset(count)}
          >{count === 365 ? "1 year" : `${count} days`}</button
        >
      {/each}
    </div>
    <form
      class="range-form"
      onsubmit={(event) => {
        event.preventDefault();
        applyRange();
      }}
    >
      <label>From date<input type="date" bind:value={draftFrom} /></label>
      <label>To date<input type="date" bind:value={draftTo} /></label>
      <button type="submit">Apply dates</button>
    </form>
  </div>
  {#if rangeError}<p class="notice" role="alert">{rangeError}</p>{/if}
  {#if error}<div class="notice" role="alert">
      <span>{error}</span><button onclick={onretry} disabled={loading}
        >Try again</button
      >
    </div>{/if}
  {#if notice}<p class="notice">{notice}</p>{/if}
  {#if loading}<p class="chart-loading" role="status">
      Loading counter history…
    </p>{/if}

  <div class="chart-summary" aria-label="Dashboard summary">
    <div>
      <span>Selected counters</span><strong data-chart-summary="selected"
        >{selected.length}<small> / {series.length} loaded</small></strong
      >
    </div>
    <div>
      <span>Recorded days</span><strong data-chart-summary="records"
        >{chartValue(records)}</strong
      ><small>Counter recordings, including zero</small>
    </div>
    <div>
      <span>Selected period</span><strong>{days}<small> days</small></strong
      ><small>{chartDate(from)} – {chartDate(to, true)}</small>
    </div>
    <div>
      <span>Converted total</span><strong data-chart-summary="converted"
        >{ratedRecorded ? chartValue(convertedTotal) : "—"}<small
          >{ratedRecorded ? ` ${valueUnit}` : ""}</small
        ></strong
      ><small
        >{rated.length
          ? `${rated.length}/${selected.length} selected counters have a rate`
          : "Set a rate below to calculate value"}</small
      >
    </div>
  </div>

  <div class="dashboard-layout">
    <aside class="counter-library" aria-labelledby="counter-library-heading">
      <div class="library-heading">
        <h2 id="counter-library-heading">Counters</h2>
        <span>{series.length} loaded</span>
      </div>
      <label class="counter-search"
        ><span class="sr">Find a counter</span><input
          type="search"
          bind:value={search}
          placeholder="Find a counter…"
        /></label
      >
      <label class="archive-choice"
        ><input
          type="checkbox"
          checked={includeArchived}
          onchange={(event) => onarchivedchange(event.currentTarget.checked)}
        />Include archived counters</label
      >
      <p class="selection-help">Select up to 8 counters to compare.</p>
      <div class="counter-options">
        {#each filtered as item (chartSeriesKey(item))}
          {@const key = chartSeriesKey(item)}
          {@const checked = selectedKeys.includes(key)}
          {@const color = selected.findIndex(
            (source) => chartSeriesKey(source) === key,
          )}
          {@const summary = chartStats(item.values, from, to)}
          <label
            class="counter-option"
            class:selected={checked}
            class:stale={item.availability === "stale"}
            data-counter-series={key}
            data-source-version={item.version}
            data-counter-name={item.name}
          >
            <input
              type="checkbox"
              aria-label={`${item.name} · ${item.card_title}`}
              {checked}
              disabled={!checked && selected.length >= 8}
              onchange={() => toggleSeries(item)}
            />
            <span class="counter-option-content">
              <span class="counter-title"
                ><span
                  class={`series-swatch series-color-${Math.max(0, color) % 8}`}
                  class:unselected={!checked}
                  aria-hidden="true"
                ></span><strong>{item.name}</strong></span
              >
              <small>{item.card_title}</small><small
                >{item.project_name}{item.archived ||
                item.card_archived ||
                item.project_archived
                  ? " · Archived"
                  : ""}{item.availability === "stale" ? " · Stale" : ""}</small
              >
              <span class="counter-option-total"
                >{summary.recorded
                  ? `${chartValue(summary.total)} ${item.unit}`
                  : "No recordings in this range"}</span
              >
            </span>
          </label>
        {:else}<p class="library-empty">
            {series.length
              ? "No counters match your search."
              : loading
                ? "Reading counters…"
                : "No counters in this selection."}
          </p>{/each}
      </div>
      {#if onloadmore}<button
          class="load-counters"
          onclick={onloadmore}
          disabled={loading}>Load more counters</button
        >{/if}
      {#if selected.length}<button
          class="clear-selection quiet"
          onclick={() => {
            selectedKeys = [];
          }}>Clear selection</button
        >{/if}
    </aside>

    <div class="chart-workspace">
      <div class="plot-controls">
        <div class="display-mode" role="group" aria-label="Chart totals">
          <button
            class:active={!cumulative}
            aria-pressed={!cumulative}
            onclick={() => {
              cumulative = false;
            }}>Daily totals</button
          >
          <button
            class:active={cumulative}
            aria-pressed={cumulative}
            onclick={() => {
              cumulative = true;
            }}>Running total</button
          >
        </div>
        <label
          >Group by<select bind:value={bucket}
            ><option value="day">Day</option><option value="week">Week</option
            ><option value="month">Month</option></select
          ></label
        >
        <label
          >Comparison scale<select bind:value={scale}
            ><option value="values">Values</option><option value="relative"
              >Relative to own peak</option
            ><option value="converted">Converted value</option></select
          ></label
        >
      </div>
      <p class="chart-explanation">
        {#if scale === "relative"}Each counter’s highest plotted value is 100%.
          Compare the shape of activity across different units.
        {:else if scale === "converted"}Recorded totals × each counter’s rate.
          Counters without a valid rate are omitted from this chart.
        {:else if totalGroups.length > 1}Counters with the same unit share a
          chart. Different units keep separate scales.
        {:else}Counters share the same scale, so their totals can be compared
          directly.{/if}
        {#if cumulative}
          Running totals start at the beginning of this date range.{/if}
        Missing days stay as gaps; a recorded zero stays zero. Weeks start on Monday.
      </p>
      {#if selected.length && records === 0}
        <EmptyState
          ><strong>No recordings in this date range.</strong>
          <p>
            Choose another range or record a counter value in its card.
          </p></EmptyState
        >
      {:else if panels.length}
        <div class="chart-panels">
          {#each panels as panel (panel.unit)}<ChartPlot
              {panel}
              {cumulative}
            />{/each}
        </div>
      {:else if selected.length && scale === "converted"}<EmptyState
          ><strong>Add a rate to see converted values.</strong>
          <p>
            Set the value of one recorded unit in the conversion section below.
          </p></EmptyState
        >
      {:else}<EmptyState
          ><strong
            >{series.length
              ? "Choose counters to start comparing."
              : "Your counters will appear here."}</strong
          >
          <p>
            {series.length
              ? "Select counters from the library to see their history and statistics."
              : "Add a counter to a card and record a value. You can then compare its daily history here."}
          </p></EmptyState
        >{/if}
    </div>
  </div>

  {#if selected.length}
    <section
      class="period-statistics"
      aria-labelledby="period-statistics-heading"
    >
      <div class="section-heading">
        <div>
          <h2 id="period-statistics-heading">Period statistics</h2>
          <p>
            Totals use recorded days in the selected range. Averages include
            recorded zeroes.
          </p>
        </div>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable statistics table needs keyboard access.) -->
      <div
        class="statistics-scroll"
        tabindex="0"
        role="region"
        aria-label="Counter statistics table"
      >
        <table class="statistics-table">
          <thead
            ><tr
              ><th scope="col">Counter</th><th scope="col">Total</th><th
                scope="col">Days recorded</th
              ><th scope="col">Average / recorded day</th><th scope="col"
                >Best day</th
              ><th scope="col">Difference</th><th scope="col"
                >Converted value</th
              ></tr
            ></thead
          >
          <tbody>
            {#each stats as row, color (chartSeriesKey(row.source))}
              {@const baseline = stats.find(
                (other) => other.source.unit.trim() === row.source.unit.trim(),
              )}
              {@const difference =
                baseline &&
                baseline !== row &&
                row.stats.recorded &&
                baseline.stats.recorded
                  ? row.stats.total - baseline.stats.total
                  : null}
              <tr
                data-counter-series={chartSeriesKey(row.source)}
                data-source-version={row.source.version}
                data-counter-name={row.source.name}
              >
                <th scope="row"
                  ><button
                    class="stat-counter quiet"
                    onclick={() => onopen(row.source)}
                    ><span
                      class={`series-swatch series-color-${color % 8}`}
                      aria-hidden="true"
                    ></span><span
                      >{row.source.name}<small>{row.source.card_title}</small
                      ></span
                    ></button
                  ></th
                >
                <td
                  ><strong data-chart-stat="total"
                    >{row.stats.recorded
                      ? chartValue(row.stats.total)
                      : "—"}</strong
                  ><small>{row.source.unit}</small></td
                >
                <td
                  ><span data-chart-stat="recorded">{row.stats.recorded}</span
                  ><small>of {days} days</small></td
                >
                <td
                  ><span data-chart-stat="average"
                    >{chartValue(row.stats.average)}</span
                  ><small>{row.source.unit}</small></td
                >
                <td
                  ><span data-chart-stat="peak"
                    >{chartValue(row.stats.peak)}</span
                  ><small
                    >{row.stats.peakDate
                      ? chartDate(row.stats.peakDate)
                      : "No recordings"}</small
                  ></td
                >
                <td
                  >{difference === null
                    ? "—"
                    : `${difference > 0 ? "+" : ""}${chartValue(difference)} ${row.source.unit}`}<small
                    >{difference !== null
                      ? `vs ${baseline?.source.name}`
                      : baseline === row
                        ? "Comparison baseline"
                        : "No same-unit baseline"}</small
                  ></td
                >
                <td
                  ><strong data-chart-stat="converted"
                    >{row.rate !== null && row.stats.recorded
                      ? chartValue(row.stats.total * row.rate)
                      : "—"}</strong
                  ><small>{row.rate !== null ? valueUnit : "No rate set"}</small
                  ></td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="conversion-section" aria-labelledby="conversion-heading">
      <div class="section-heading">
        <div>
          <h2 id="conversion-heading">Turn counts into value</h2>
          <p>
            For example, 10 hours × 100 PLN per hour = 1,000 PLN. Rates are
            saved in this browser for your profile.
          </p>
        </div>
        <label
          >Output unit<input
            type="text"
            maxlength="12"
            bind:value={outputUnit}
            onchange={savePreferences}
            placeholder="PLN, EUR, points…"
          /></label
        >
      </div>
      <div class="conversion-grid">
        {#each stats as row, color (chartSeriesKey(row.source))}
          {@const key = chartSeriesKey(row.source)}
          {@const raw = rates[key] ?? ""}
          <article class="conversion-card" data-conversion-series={key}>
            <div class="conversion-title">
              <span
                class={`series-swatch series-color-${color % 8}`}
                aria-hidden="true"
              ></span><strong>{row.source.name}</strong><small
                >{row.source.card_title}</small
              >
            </div>
            <div class="conversion-equation">
              <span
                >{row.stats.recorded ? chartValue(row.stats.total) : "—"}
                <small>{row.source.unit}</small></span
              ><span aria-hidden="true">×</span><label
                ><span class="sr"
                  >Rate for {row.source.name} · {row.source.card_title}</span
                ><input
                  type="text"
                  inputmode="decimal"
                  maxlength="40"
                  value={raw}
                  placeholder="Set rate"
                  aria-invalid={raw.trim() !== "" && row.rate === null}
                  oninput={(event) => setRate(key, event.currentTarget.value)}
                /></label
              ><span aria-hidden="true">=</span><strong
                >{row.rate !== null && row.stats.recorded
                  ? chartValue(row.stats.total * row.rate)
                  : "—"}<small>{valueUnit}</small></strong
              >
            </div>
            <p class:invalid={raw.trim() !== "" && row.rate === null}>
              {raw.trim() !== "" && row.rate === null
                ? "Enter a rate from 0 to 1,000,000,000 using a decimal point."
                : `${valueUnit} per ${row.source.unit || "unit"}`}
            </p>
          </article>
        {/each}
      </div>
      {#if storageMessage}<p role="status" class="notice">
          {storageMessage}
        </p>{/if}
    </section>
  {/if}
</section>

<style>
  .chart-dashboard {
    min-width: 0;
  }
  .chart-intro {
    color: var(--muted);
    max-width: 620px;
    margin: 0;
    font-size: var(--text-label);
  }
  .range-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: end;
    flex-wrap: wrap;
    gap: var(--space-8);
    margin-bottom: var(--space-9);
  }
  .range-presets,
  .display-mode {
    display: flex;
    gap: var(--space-2);
    background: var(--soft);
    padding: var(--space-2);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
  }
  .range-presets button,
  .display-mode button {
    border: 0;
    background: transparent;
    padding: var(--space-4) var(--space-6);
    font-size: var(--text-sm);
    min-height: 36px;
    color: var(--muted);
    white-space: nowrap;
  }
  button.active {
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow-sm);
    font-weight: var(--weight-semibold);
  }
  .range-form {
    display: flex;
    gap: var(--space-6);
    align-items: end;
    flex-wrap: wrap;
  }
  .range-form label,
  .plot-controls label,
  .section-heading label {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted);
  }
  .range-form input {
    font-size: var(--text-sm);
    width: 148px;
  }
  .range-form button {
    font-size: var(--text-sm);
  }
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
  }
  .chart-loading {
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .chart-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-8);
    margin: var(--space-9) 0 var(--space-10);
  }
  .chart-summary > div {
    padding: var(--space-8) var(--space-9);
    background: var(--soft);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    min-width: 0;
  }
  .chart-summary span {
    display: block;
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .chart-summary strong {
    display: block;
    font-size: var(--text-title);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-tight);
    margin: var(--space-4) 0;
    letter-spacing: var(--tracking-tight);
    overflow-wrap: anywhere;
  }
  .chart-summary small {
    font-size: var(--text-xs);
    color: var(--muted);
    font-weight: var(--weight-normal);
    letter-spacing: normal;
  }
  .chart-summary strong small {
    font-size: var(--text-label);
  }
  .dashboard-layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: var(--space-10);
    align-items: start;
  }
  .counter-library {
    min-width: 0;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    padding: var(--space-8);
  }
  .library-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }
  h2 {
    font-size: var(--text-lg);
    margin: 0;
  }
  .library-heading > span {
    font-size: var(--text-xs);
    color: var(--muted);
  }
  .counter-search {
    display: block;
    margin: var(--space-8) 0 var(--space-4);
  }
  .counter-search input {
    width: 100%;
    font-size: var(--text-sm);
  }
  .archive-choice {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--tap-target);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .selection-help {
    color: var(--muted);
    font-size: var(--text-xs);
    margin: 0 0 var(--space-6);
  }
  .counter-options {
    max-height: 550px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .counter-option {
    display: flex;
    align-items: start;
    gap: var(--space-6);
    padding: var(--space-7) var(--space-6);
    border: var(--stroke) solid transparent;
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  .counter-option:hover {
    background: var(--soft);
  }
  .counter-option.selected {
    background: var(--accent);
    border-color: color-mix(in srgb, var(--accent-ink) 24%, var(--line));
  }
  .counter-option > input {
    margin: var(--space-2) 0 0;
    flex-shrink: 0;
  }
  .counter-option-content {
    min-width: 0;
    flex: 1;
  }
  .counter-title {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--text-label);
  }
  .counter-title strong {
    font-weight: var(--weight-semibold);
    overflow-wrap: anywhere;
  }
  .counter-option small {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .counter-option-total {
    display: block;
    font-size: var(--text-sm);
    margin-top: var(--space-4);
    overflow-wrap: anywhere;
  }
  .series-swatch {
    display: inline-block;
    width: var(--space-4);
    height: var(--space-4);
    border-radius: 50%;
    background: var(--series-color);
    flex-shrink: 0;
  }
  .series-swatch.unselected {
    background: var(--line-strong);
  }
  .library-empty {
    color: var(--muted);
    font-size: var(--text-sm);
    padding: var(--space-8) 0;
  }
  .clear-selection,
  .load-counters {
    width: 100%;
    margin-top: var(--space-6);
    font-size: var(--text-sm);
  }
  .chart-workspace {
    min-width: 0;
  }
  .plot-controls {
    display: flex;
    align-items: end;
    gap: var(--space-6);
    flex-wrap: wrap;
  }
  .display-mode {
    margin-right: auto;
  }
  .plot-controls select {
    font-size: var(--text-sm);
    min-height: var(--tap-target);
    max-width: 100%;
  }
  .chart-explanation {
    font-size: var(--text-sm);
    color: var(--muted);
    margin: var(--space-6) 0 var(--space-8);
    line-height: var(--leading-body);
  }
  .chart-panels {
    display: grid;
    gap: var(--space-8);
  }
  .period-statistics,
  .conversion-section {
    margin-top: var(--space-12);
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: var(--space-8);
    margin-bottom: var(--space-8);
  }
  .section-heading p {
    color: var(--muted);
    font-size: var(--text-sm);
    margin: var(--space-4) 0 0;
    max-width: 650px;
  }
  .section-heading input {
    width: 170px;
    font-size: var(--text-sm);
  }
  .statistics-scroll {
    overflow-x: auto;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
  }
  .statistics-table {
    width: 100%;
    min-width: 850px;
    border-collapse: collapse;
    text-align: left;
    font-size: var(--text-label);
  }
  .statistics-table th,
  .statistics-table td {
    padding: var(--space-8);
    border-bottom: var(--stroke) solid var(--line);
    vertical-align: middle;
  }
  .statistics-table tr:last-child th,
  .statistics-table tr:last-child td {
    border-bottom: 0;
  }
  .statistics-table thead th {
    color: var(--muted);
    background: var(--soft);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }
  .statistics-table strong {
    font-weight: var(--weight-semibold);
  }
  .statistics-table small {
    display: block;
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-normal);
    margin-top: var(--space-2);
  }
  .stat-counter {
    display: flex;
    align-items: center;
    text-align: left;
    gap: var(--space-6);
    padding: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-semibold);
  }
  .stat-counter > span:last-child {
    max-width: 220px;
    overflow-wrap: anywhere;
  }
  .conversion-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-8);
  }
  .conversion-card {
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    padding: var(--space-8) var(--space-9);
    min-width: 0;
    background: var(--soft);
  }
  .conversion-title {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
    font-size: var(--text-label);
  }
  .conversion-title small {
    color: var(--muted);
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
  }
  .conversion-equation {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    margin-top: var(--space-6);
  }
  .conversion-equation > span {
    flex-shrink: 0;
  }
  .conversion-equation > span:first-child {
    max-width: 25%;
    overflow-wrap: anywhere;
  }
  .conversion-equation label {
    flex: 1;
    min-width: 60px;
    max-width: 145px;
  }
  .conversion-equation input {
    width: 100%;
    text-align: center;
    font-size: var(--text-label);
  }
  .conversion-equation strong {
    font-size: var(--text-xl);
    letter-spacing: var(--tracking-tight);
    overflow-wrap: anywhere;
  }
  .conversion-equation small {
    display: block;
    font-size: var(--text-xs);
    color: var(--muted);
    letter-spacing: normal;
  }
  .conversion-card p {
    color: var(--muted);
    font-size: var(--text-xs);
    margin: var(--space-4) 0 0;
  }
  .conversion-card p.invalid {
    color: var(--danger);
  }
  :global(.chart-dashboard .series-color-0) {
    --series-color: var(--accent-ink);
  }
  :global(.chart-dashboard .series-color-1) {
    --series-color: var(--success);
  }
  :global(.chart-dashboard .series-color-2) {
    --series-color: var(--notice-ink);
  }
  :global(.chart-dashboard .series-color-3) {
    --series-color: var(--danger);
  }
  :global(.chart-dashboard .series-color-4) {
    --series-color: color-mix(in srgb, var(--accent-ink) 50%, var(--danger));
  }
  :global(.chart-dashboard .series-color-5) {
    --series-color: color-mix(in srgb, var(--success) 55%, var(--accent-ink));
  }
  :global(.chart-dashboard .series-color-6) {
    --series-color: color-mix(in srgb, var(--notice-ink) 65%, var(--danger));
  }
  :global(.chart-dashboard .series-color-7) {
    --series-color: var(--muted);
  }
  @media (max-width: 1100px) {
    .dashboard-layout {
      grid-template-columns: 230px minmax(0, 1fr);
      gap: var(--space-8);
    }
    .chart-summary {
      gap: var(--space-6);
    }
    .chart-summary > div {
      padding: var(--space-8);
    }
    .plot-controls {
      align-items: stretch;
    }
    .display-mode {
      margin-right: 0;
    }
  }
  @media (max-width: 850px) {
    .dashboard-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .counter-options {
      max-height: 250px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }
    .counter-library {
      padding: var(--space-8);
    }
    .archive-choice {
      display: inline-flex;
    }
    .chart-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .conversion-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 700px) {
    .range-toolbar {
      align-items: stretch;
    }
    .range-presets {
      width: 100%;
    }
    .range-presets button {
      flex: 1;
      min-height: var(--tap-target);
      padding: var(--space-4);
    }
    .range-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }
    .range-form label {
      min-width: 0;
    }
    .range-form input {
      width: 100%;
      font-size: var(--text-lg);
    }
    .range-form button {
      grid-column: 1 / -1;
    }
    .chart-summary > div {
      padding: var(--space-6) var(--space-8);
    }
    .chart-summary strong {
      font-size: var(--text-xl);
    }
    .counter-search input,
    .plot-controls select,
    .section-heading input {
      font-size: var(--text-lg);
    }
    .plot-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .display-mode {
      grid-column: 1 / -1;
    }
    .display-mode button {
      flex: 1;
      min-height: var(--tap-target);
    }
    .plot-controls label {
      min-width: 0;
    }
    .section-heading {
      flex-wrap: wrap;
    }
    .conversion-equation {
      gap: var(--space-4);
    }
    .counter-options {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
