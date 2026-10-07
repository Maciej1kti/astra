<script lang="ts">
  import { countedDays } from "../../lib/ui/locale.ts";
  import {
    chartDate,
    chartSeriesKey,
    chartValue,
    type ChartSeries,
    type ChartSummaryRow,
  } from "./chart-model";

  let {
    rows,
    days,
    rates,
    outputUnit,
    onrate,
    onoutputunit,
    onopen,
  }: {
    rows: ChartSummaryRow[];
    days: number;
    rates: Record<string, string>;
    outputUnit: string;
    onrate: (key: string, value: string) => void;
    onoutputunit: (value: string) => void;
    onopen: (series: ChartSeries) => void;
  } = $props();

  const valueUnit = $derived(outputUnit.trim() || "wartość");
  const unitOf = (row: ChartSummaryRow) => row.source.unit.trim();
  // Totals compare against the first selected counter that shares the unit.
  const compared = $derived(
    rows.map((row) => {
      const baseline = rows.find((other) => unitOf(other) === unitOf(row));
      return {
        row,
        baseline,
        alone: !rows.some(
          (other) => other !== row && unitOf(other) === unitOf(row),
        ),
        difference:
          baseline &&
          baseline !== row &&
          row.stats.recorded &&
          baseline.stats.recorded
            ? row.stats.total - baseline.stats.total
            : null,
      };
    }),
  );
  const comparable = $derived(
    compared.some((entry) => entry.baseline && entry.baseline !== entry.row),
  );
  const records = $derived(
    rows.reduce((sum, row) => sum + row.stats.recorded, 0),
  );
  const units = $derived([...new Set(rows.map(unitOf))]);
  const total = $derived(
    units.length === 1 && records > 0
      ? rows.reduce((sum, row) => sum + row.stats.total, 0)
      : null,
  );
  const rated = $derived(rows.filter((row) => row.rate !== null));
  const ratedRecorded = $derived(rated.some((row) => row.stats.recorded > 0));
  const converted = $derived(
    rated.reduce((sum, row) => sum + row.stats.total * (row.rate ?? 0), 0),
  );
</script>

<section class="chart-summary" aria-labelledby="chart-summary-heading">
  <div class="summary-heading">
    <div>
      <h2 id="chart-summary-heading">Podsumowanie okresu</h2>
      <p>
        Średnia liczy dni z zapisem, także z zapisanym zerem. Wartość to suma
        pomnożona przez stawkę. Stawki zostają w tej przeglądarce.
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
  <div
    class="summary-table"
    class:comparable
    role="table"
    aria-labelledby="chart-summary-heading"
  >
    <div class="summary-row summary-head" role="row">
      <span role="columnheader">Licznik</span>
      <span role="columnheader">Suma</span>
      <span role="columnheader">Dni z zapisami</span>
      <span role="columnheader">Średnia na dzień</span>
      <span role="columnheader">Najlepszy dzień</span>
      {#if comparable}<span role="columnheader">Różnica</span>{/if}
      <span role="columnheader">Stawka</span>
      <span role="columnheader">Wartość</span>
    </div>
    {#each compared as { row, baseline, alone, difference } (chartSeriesKey(row.source))}
      {@const key = chartSeriesKey(row.source)}
      {@const raw = rates[key] ?? ""}
      {@const invalid = raw.trim() !== "" && row.rate === null}
      <div
        class="summary-row"
        role="row"
        data-chart-row
        data-counter-series={key}
        data-source-version={row.source.version}
        data-counter-name={row.source.name}
      >
        <span class="cell-name" role="rowheader"
          ><button
            type="button"
            class="summary-counter quiet"
            onclick={() => onopen(row.source)}
            ><span
              class={`series-swatch series-color-${row.color % 8}`}
              aria-hidden="true"
            ></span><span
              >{row.source.name}<small>{row.source.card_title}</small></span
            ></button
          ></span
        >
        <span role="cell" class="cell-total"
          ><span class="cell-label" aria-hidden="true">Suma</span><strong
            data-chart-stat="total"
            >{row.stats.recorded ? chartValue(row.stats.total) : "—"}</strong
          ><small>{row.source.unit}</small></span
        >
        <span role="cell" class="cell-stat"
          ><span class="cell-label" aria-hidden="true">Dni z zapisami</span
          ><span data-chart-stat="recorded">{row.stats.recorded}</span><small
            >z {countedDays(days)}</small
          ></span
        >
        <span role="cell" class="cell-stat"
          ><span class="cell-label" aria-hidden="true">Średnia na dzień</span
          ><span data-chart-stat="average">{chartValue(row.stats.average)}</span
          ><small>{row.source.unit}</small></span
        >
        <span role="cell" class="cell-stat"
          ><span class="cell-label" aria-hidden="true">Najlepszy dzień</span
          ><span data-chart-stat="peak">{chartValue(row.stats.peak)}</span
          ><small
            >{row.stats.peakDate
              ? chartDate(row.stats.peakDate)
              : "Brak zapisów"}</small
          ></span
        >
        {#if comparable}<span
            role="cell"
            class="cell-difference"
            class:blank={baseline === row}
            ><span class="cell-label" aria-hidden="true">Różnica</span><span
              data-chart-stat="difference"
              >{difference === null
                ? "—"
                : `${difference > 0 ? "+" : ""}${chartValue(difference)} ${row.source.unit}`}</span
            ><small
              >{alone
                ? "Jedyny w tej jednostce"
                : baseline === row
                  ? "Punkt odniesienia"
                  : difference !== null
                    ? `wobec: ${baseline?.source.name}`
                    : "Brak zapisów do porównania"}</small
            ></span
          >{/if}
        <span role="cell" class="cell-rate"
          ><span class="cell-label" aria-hidden="true">Stawka</span><input
            type="text"
            inputmode="decimal"
            maxlength="40"
            value={raw}
            placeholder="np. 100"
            aria-label={`Stawka dla ${row.source.name} · ${row.source.card_title}`}
            aria-invalid={invalid}
            oninput={(event) => onrate(key, event.currentTarget.value)}
          /><small class:invalid
            >{invalid
              ? "Liczba od 0 do 1 000 000 000"
              : `${valueUnit} za ${row.source.unit || "jednostkę"}`}</small
          ></span
        >
        <span role="cell" class="cell-value"
          ><span class="cell-label" aria-hidden="true">Wartość</span><strong
            data-chart-stat="converted"
            >{row.rate !== null && row.stats.recorded
              ? chartValue(row.stats.total * row.rate)
              : "—"}</strong
          ><small>{row.rate !== null ? valueUnit : "Bez stawki"}</small></span
        >
      </div>
    {/each}
    <div class="summary-row summary-total" role="row">
      <span class="cell-name" role="rowheader">Razem</span>
      <span role="cell" class="cell-total" class:blank={total === null}
        ><span class="cell-label" aria-hidden="true">Suma</span><strong
          >{chartValue(total)}</strong
        ><small>{total === null ? "" : units[0]}</small></span
      >
      <span role="cell" class="cell-stat"
        ><span class="cell-label" aria-hidden="true">Dni z zapisami</span><span
          data-chart-summary="records">{chartValue(records)}</span
        ><small>łącznie</small></span
      >
      <span role="cell" class="blank"></span>
      <span role="cell" class="blank"></span>
      {#if comparable}<span role="cell" class="blank"></span>{/if}
      <span role="cell" class="blank"></span>
      <span role="cell" class="cell-value"
        ><span class="cell-label" aria-hidden="true">Wartość</span><strong
          data-chart-summary="converted"
          >{ratedRecorded ? chartValue(converted) : "—"}<span
            >{ratedRecorded ? ` ${valueUnit}` : ""}</span
          ></strong
        ><small
          >{rated.length
            ? `${rated.length} z ${rows.length} ze stawką`
            : "Wpisz stawkę, aby przeliczyć"}</small
        ></span
      >
    </div>
  </div>
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
  .summary-table {
    --stat-columns: 4;
    display: grid;
    grid-template-columns:
      minmax(var(--field-min-width), 1.7fr) repeat(
        var(--stat-columns),
        minmax(0, 1fr)
      )
      minmax(var(--field-compact), 1.1fr) minmax(0, 1fr);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
  }
  .summary-table.comparable {
    --stat-columns: 5;
  }
  .summary-row {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    column-gap: var(--space-8);
    padding: var(--space-6) var(--space-8);
    border-top: var(--stroke) solid var(--line);
  }
  .summary-row > * {
    min-width: 0;
  }
  .summary-head {
    border-top: 0;
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    background: var(--soft);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .summary-total {
    border-radius: 0 0 var(--radius-card) var(--radius-card);
    background: var(--soft);
  }
  .summary-total .cell-name {
    font-weight: var(--weight-semibold);
  }
  .cell-label {
    display: none;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .summary-row strong {
    font-weight: var(--weight-semibold);
  }
  .summary-row small {
    display: block;
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-normal);
    overflow-wrap: anywhere;
  }
  .summary-row small.invalid {
    color: var(--danger);
  }
  .summary-counter {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
    padding: var(--space-2) var(--space-4);
    margin-left: calc(-1 * var(--space-4));
    text-align: left;
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
  .cell-rate input {
    width: 100%;
    max-width: var(--field-compact);
    font-size: var(--text-base);
  }
  .cell-rate input[aria-invalid="true"] {
    border-color: var(--danger);
  }
  /* Narrow: every counter is the same card. Name and total, then rate and
     value, then the quieter statistics in one line. */
  @container summary (max-width: 860px) {
    .summary-table {
      grid-template-columns: repeat(auto-fill, minmax(var(--panel-width), 1fr));
      gap: var(--space-6);
      border: 0;
      border-radius: 0;
    }
    /* Each card labels its own values, so the header row is only announced. */
    .summary-head {
      position: absolute;
      width: var(--stroke);
      height: var(--stroke);
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .summary-row {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      grid-column: auto;
      align-items: start;
      gap: var(--space-6) var(--space-6);
      padding: var(--space-6) var(--space-8) var(--space-7);
      border: var(--stroke) solid var(--line);
      border-radius: var(--radius-card);
    }
    .summary-total {
      border-radius: var(--radius-card);
    }
    .cell-name {
      grid-column: 1 / span 4;
      align-self: center;
    }
    .cell-total {
      grid-column: 5 / span 2;
    }
    .cell-rate {
      grid-column: 1 / span 3;
      grid-row: 2;
    }
    .cell-value {
      grid-column: 4 / span 3;
      grid-row: 2;
    }
    .cell-total,
    .cell-value {
      text-align: right;
    }
    .cell-value strong {
      font-size: var(--text-xl);
    }
    .cell-stat {
      grid-column: span 2;
      grid-row: 3;
      font-size: var(--text-sm);
    }
    .cell-difference {
      grid-column: 1 / -1;
      grid-row: 4;
      font-size: var(--text-sm);
    }
    .cell-difference > * {
      display: inline;
      margin-right: var(--space-3);
    }
    .cell-label {
      display: block;
    }
    .cell-total .cell-label {
      display: none;
    }
    .blank {
      display: none;
    }
    /* The reference counter keeps the line, so cards stay the same height. */
    .cell-difference.blank {
      display: block;
    }
    .cell-rate input {
      max-width: none;
    }
  }
  @media (max-width: 700px) {
    .summary-heading input,
    .cell-rate input {
      font-size: var(--text-lg);
    }
  }
</style>
