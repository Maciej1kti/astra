<script lang="ts">
  import Icon from "../../lib/ui/Icon.svelte";
  import {
    chartSeriesKey,
    chartStats,
    chartValue,
    type ChartSeries,
  } from "./chart-model";

  let {
    series,
    selectedKeys,
    colors,
    from,
    to,
    limit,
    loading,
    includeArchived,
    ontoggle,
    onclear,
    onarchivedchange,
    onloadmore,
  }: {
    series: ChartSeries[];
    selectedKeys: string[];
    colors: Record<string, number>;
    from: string;
    to: string;
    limit: number;
    loading: boolean;
    includeArchived: boolean;
    ontoggle: (series: ChartSeries) => void;
    onclear: () => void;
    onarchivedchange: (include: boolean) => void;
    onloadmore?: () => void;
  } = $props();

  let search = $state("");
  let expanded = $state(false);

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
  const projects = $derived(new Set(series.map((item) => item.project_id)));
  // With nothing chosen the list is the next step, so it is never hidden.
  const open = $derived(expanded || selected.length === 0);
</script>

<!-- Layout decides the form: a side rail is always open, while the stacked
     picker collapses in place. Both headings exist and CSS shows one. -->
<aside
  class="counter-picker"
  class:collapsed={!open}
  aria-labelledby="counter-picker-heading"
>
  <h2 id="counter-picker-heading">
    {#snippet summary(counted: boolean)}
      <span class="picker-title">Liczniki</span>
      <span class="picker-swatches" aria-hidden="true">
        {#each selected as item (chartSeriesKey(item))}<span
            class={`series-swatch series-color-${colors[chartSeriesKey(item)] ?? 0}`}
          ></span>{/each}
      </span>
      <span class="picker-count"
        ><span data-chart-summary={counted ? "selected" : undefined}
          >{selected.length}</span
        >
        z {series.length}</span
      >
    {/snippet}
    <span class="picker-summary picker-static">{@render summary(true)}</span>
    <button
      type="button"
      class="picker-summary picker-toggle quiet"
      aria-expanded={open}
      aria-controls="counter-picker-body"
      disabled={selected.length === 0}
      onclick={() => {
        expanded = !expanded;
      }}
      >{@render summary(false)}<Icon
        name={open ? "chevronUp" : "chevronDown"}
        small
      /></button
    >
  </h2>
  <div id="counter-picker-body" class="picker-body">
    {#if series.length}<label class="counter-search"
        ><span class="sr">Znajdź licznik</span><input
          type="search"
          bind:value={search}
          placeholder="Znajdź licznik…"
        /></label
      >{/if}
    <div class="counter-options">
      {#each filtered as item (chartSeriesKey(item))}
        {@const key = chartSeriesKey(item)}
        {@const checked = selectedKeys.includes(key)}
        {@const summary = chartStats(item.values, from, to)}
        <label
          class="counter-option"
          class:stale={item.availability === "stale"}
          data-counter-series={key}
          data-source-version={item.version}
          data-counter-name={item.name}
        >
          <input
            type="checkbox"
            aria-label={`${item.name} · ${item.card_title}`}
            {checked}
            disabled={!checked && selected.length >= limit}
            onchange={() => ontoggle(item)}
          />
          <span
            class={`series-swatch series-color-${colors[key] ?? 0}`}
            class:unselected={!checked}
            aria-hidden="true"
          ></span>
          <span class="counter-text">
            <strong>{item.name}</strong>
            <small
              >{item.card_title}{projects.size > 1
                ? `, ${item.project_name}`
                : ""}</small
            >
            {#if item.archived || item.card_archived || item.project_archived || item.availability === "stale"}
              <span class="counter-flags">
                {#if item.archived || item.card_archived || item.project_archived}<span
                    class="badge">Zarchiwizowany</span
                  >{/if}
                {#if item.availability === "stale"}<span class="badge attention"
                    >Nieaktualny</span
                  >{/if}
              </span>
            {/if}
          </span>
          <span class="counter-total">
            {#if summary.recorded}{chartValue(summary.total, true)}
              <small>{item.unit}</small>{:else}<span aria-hidden="true">—</span
              ><span class="sr">Brak zapisów w tym zakresie</span>{/if}
          </span>
        </label>
      {:else}<p class="library-empty">
          {series.length
            ? "Brak liczników pasujących do wyszukiwania."
            : loading
              ? "Wczytywanie liczników…"
              : "Brak liczników w tym wyborze."}
        </p>{/each}
    </div>
    {#if selected.length >= limit}<p class="picker-limit">
        Na wykresie mieści się {limit} liczników. Odznacz jeden, aby dodać inny.
      </p>{/if}
    {#if onloadmore}<button
        type="button"
        class="load-counters"
        onclick={onloadmore}
        disabled={loading}>Wczytaj więcej liczników</button
      >{/if}
    <div class="picker-footer">
      <label class="archive-choice"
        ><input
          type="checkbox"
          checked={includeArchived}
          onchange={(event) => onarchivedchange(event.currentTarget.checked)}
        />Także zarchiwizowane</label
      >
      {#if selected.length}<button
          type="button"
          class="clear-selection quiet"
          onclick={onclear}>Wyczyść wybór</button
        >{/if}
    </div>
  </div>
</aside>

<style>
  .counter-picker {
    min-width: 0;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    background: var(--paper);
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
  }
  .picker-summary {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    min-height: var(--tap-target);
    padding: var(--space-4) var(--space-8);
    font-weight: inherit;
    text-align: left;
    color: var(--ink);
  }
  .picker-static {
    display: none;
  }
  .picker-toggle {
    border-radius: var(--radius-card);
  }
  .picker-toggle:disabled {
    opacity: 1;
  }
  .picker-swatches {
    display: flex;
    gap: var(--space-1);
    min-width: 0;
    overflow: hidden;
  }
  .picker-count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .picker-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 var(--space-4) var(--space-4);
  }
  .collapsed .picker-body {
    display: none;
  }
  .counter-search {
    display: block;
    padding: 0 var(--space-4) var(--space-4);
  }
  .counter-search input {
    width: 100%;
    font-size: var(--text-label);
  }
  .counter-options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    column-gap: var(--space-4);
    min-height: 0;
    max-height: min(60dvh, 420px);
    overflow-y: auto;
  }
  .counter-option {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--tap-target);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  .counter-option:hover {
    background: var(--soft);
  }
  .counter-option:has(input:disabled) {
    cursor: default;
    color: var(--muted);
  }
  .counter-option.stale {
    opacity: 0.75;
  }
  .counter-option > input {
    margin: 0;
  }
  .counter-text {
    min-width: 0;
    display: grid;
  }
  .counter-text strong {
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    overflow-wrap: anywhere;
  }
  .counter-text small {
    font-size: var(--text-xs);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .counter-flags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .counter-flags .badge {
    font-size: var(--text-xs);
  }
  .counter-total {
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .counter-total small {
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .series-swatch {
    width: var(--space-5);
    height: var(--space-5);
    border-radius: var(--radius-sm);
    background: var(--series-color);
    flex-shrink: 0;
  }
  .series-swatch.unselected {
    visibility: hidden;
  }
  .library-empty,
  .picker-limit {
    margin: 0;
    padding: var(--space-4);
    color: var(--muted);
    font-size: var(--text-label);
  }
  .picker-limit {
    font-size: var(--text-sm);
  }
  .load-counters {
    margin: var(--space-4);
    font-size: var(--text-label);
  }
  .picker-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0 var(--space-4);
    margin-top: var(--space-2);
    padding: var(--space-2) 0 0 var(--space-4);
    border-top: var(--stroke) solid var(--line);
  }
  .archive-choice {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--tap-target);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .clear-selection {
    padding-inline: var(--space-2);
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .clear-selection:hover {
    color: var(--ink);
  }
  /* Keep in step with the two-column rule in ChartDashboard. */
  @container chart (min-width: 940px) {
    .counter-picker {
      position: sticky;
      top: var(--space-6);
      display: flex;
      flex-direction: column;
      max-height: calc(100dvh - 2 * var(--space-6));
    }
    .picker-static {
      display: flex;
    }
    .picker-toggle {
      display: none;
    }
    .collapsed .picker-body {
      display: flex;
    }
    .counter-options {
      display: block;
      max-height: none;
    }
  }
</style>
