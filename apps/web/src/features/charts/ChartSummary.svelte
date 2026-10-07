<script lang="ts">
  import type { Snippet } from "svelte";
  import { chartSeriesKey, type ChartSummaryRow } from "./chart-model";
  import { tileMetrics, tileSelection, tileValues } from "./chart-tiles";

  let {
    rows,
    days,
    tiles,
    outputUnit,
    onoutputunit,
    onconfigure,
    footer,
  }: {
    rows: ChartSummaryRow[];
    days: number;
    /** Saved value choices by counter key; absent means the default. */
    tiles: Record<string, string[]> | undefined;
    outputUnit: string;
    onoutputunit: (value: string) => void;
    onconfigure: (row: ChartSummaryRow) => void;
    /** What enabled plugins add below the tiles. */
    footer?: Snippet;
  } = $props();

  // Test hooks keep the names the statistics had as table columns.
  const stat: Record<string, string> = { value: "converted" };
</script>

<section class="chart-summary" aria-labelledby="chart-summary-heading">
  <div class="summary-heading">
    <div>
      <h2 id="chart-summary-heading">Podsumowanie okresu</h2>
      <p>
        Każdy kafel pokazuje wartości jednego licznika. Kliknij kafel, aby
        wybrać, które wartości pokazuje.
      </p>
    </div>
    <label
      >Jednostka wynikowa<input
        type="text"
        maxlength="12"
        value={outputUnit}
        oninput={(event) => onoutputunit(event.currentTarget.value)}
        placeholder="PLN, EUR, punkty…"
      /></label
    >
  </div>
  <div class="summary-tiles">
    {#each rows as row (chartSeriesKey(row.source))}
      {@const key = chartSeriesKey(row.source)}
      {@const values = tileValues(row, rows, days, outputUnit)}
      {@const chosen = tileSelection(tiles, key)}
      <button
        type="button"
        class="summary-tile quiet"
        aria-label={`${row.source.name} · ${row.source.card_title}: wybierz wartości kafla`}
        data-chart-row
        data-counter-series={key}
        data-source-version={row.source.version}
        data-counter-name={row.source.name}
        onclick={() => onconfigure(row)}
      >
        <span class="tile-name"
          ><span
            class={`series-swatch series-color-${row.color % 8}`}
            aria-hidden="true"
          ></span><span
            >{row.source.name}<small>{row.source.card_title}</small></span
          ></span
        >
        {#if chosen.length}<span class="tile-values">
            {#each tileMetrics.filter( (metric) => chosen.includes(metric.id) ) as metric (metric.id)}
              <span class="tile-value" data-tile-metric={metric.id}
                ><span class="tile-label">{metric.label}</span><strong
                  data-chart-stat={stat[metric.id] ?? metric.id}
                  >{values[metric.id]?.value}</strong
                ><small>{values[metric.id]?.note}</small></span
              >
            {/each}
          </span>{:else}<span class="tile-empty">Nie wybrano wartości</span
          >{/if}
      </button>
    {/each}
  </div>
  {@render footer?.()}
</section>

<style>
  .chart-summary {
    container: summary / inline-size;
    margin-top: var(--space-12);
  }
  .summary-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    flex-wrap: wrap;
    gap: var(--space-6) var(--space-10);
    margin-bottom: var(--space-8);
  }
  h2 {
    margin: 0;
    font-size: var(--text-xl);
    letter-spacing: var(--tracking-tight);
  }
  .summary-heading p {
    max-width: var(--measure);
    margin: var(--space-2) 0 0;
    color: var(--muted);
    font-size: var(--text-base);
  }
  .summary-heading label {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    color: var(--muted);
    font-size: var(--text-base);
    white-space: nowrap;
  }
  .summary-heading input {
    width: var(--field-compact);
    font-size: var(--text-base);
  }
  .summary-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--panel-width), 1fr));
    gap: var(--space-6);
    align-items: start;
  }
  .summary-tile {
    display: grid;
    gap: var(--space-6);
    width: 100%;
    min-width: 0;
    padding: var(--space-6) var(--space-8) var(--space-7);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    background: var(--paper);
    color: inherit;
    font: inherit;
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--motion-quick) var(--motion-ease),
      background-color var(--motion-quick) var(--motion-ease);
  }
  .summary-tile:hover {
    border-color: var(--line-strong);
    background: var(--soft);
  }
  .tile-name {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    font-weight: var(--weight-semibold);
    overflow-wrap: anywhere;
  }
  .series-swatch {
    width: var(--space-5);
    height: var(--space-5);
    border-radius: var(--radius-sm);
    background: var(--series-color);
    flex-shrink: 0;
  }
  /* Every tile lays its values on the same three columns. */
  .tile-values {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-6) var(--space-6);
  }
  .tile-value {
    display: block;
    min-width: 0;
  }
  .tile-label {
    display: block;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .tile-value strong {
    display: block;
    font-weight: var(--weight-semibold);
    overflow-wrap: anywhere;
  }
  .summary-tile small {
    display: block;
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-normal);
    overflow-wrap: anywhere;
  }
  .tile-empty {
    color: var(--muted);
    font-size: var(--text-sm);
  }
  @container summary (max-width: 360px) {
    .tile-values {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 700px) {
    .summary-heading input {
      font-size: var(--text-lg);
    }
  }
</style>
