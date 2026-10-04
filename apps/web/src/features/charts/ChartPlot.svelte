<script lang="ts">
  import { counted } from "../../lib/ui/locale.ts";
  import {
    chartDate,
    chartDomain,
    chartLine,
    chartSeriesKey,
    chartValue,
    chartX,
    chartY,
    type ChartPanel,
  } from "./chart-model";

  let { panel, cumulative }: { panel: ChartPanel; cumulative: boolean } =
    $props();
  let inspected = $state<number | null>(null);
  let containerWidth = $state(920);
  const width = $derived(Math.max(240, containerWidth));
  const left = $derived(width < 550 ? 44 : 66);
  const right = $derived(width - (width < 550 ? 24 : 38));
  const count = $derived(panel.series[0]?.points.length ?? 0);
  const index = $derived(
    Math.min(Math.max(0, inspected ?? count - 1), Math.max(0, count - 1)),
  );
  const period = $derived(panel.series[0]?.points[index]);
  const inputId = $derived(`chart-date-${encodeURIComponent(panel.unit)}`);
  const domain = $derived(chartDomain(panel));
  const ticks = $derived(
    Array.from(
      { length: 5 },
      (_, i) => domain.min + ((domain.max - domain.min) * i) / 4,
    ),
  );
  const labels = $derived(
    [
      ...new Set(
        width < 550
          ? [0, Math.floor((count - 1) / 2), count - 1]
          : [
              0,
              Math.floor((count - 1) / 4),
              Math.floor((count - 1) / 2),
              Math.floor(((count - 1) * 3) / 4),
              count - 1,
            ],
      ),
    ].filter((i) => i >= 0 && i < count),
  );

  function inspect(event: PointerEvent) {
    if (event.pointerType !== "mouse" && event.type === "pointermove") return;
    const bounds = (event.currentTarget as SVGElement).getBoundingClientRect();
    const viewX = ((event.clientX - bounds.left) / bounds.width) * width;
    inspected = Math.round(
      Math.min(1, Math.max(0, (viewX - left) / (right - left))) * (count - 1),
    );
  }
</script>

<section class="chart-panel" aria-label={`Wykres w ${panel.unit}`}>
  <div class="plot-heading">
    <div>
      <span class="eyebrow"
        >{cumulative ? "SUMA NARASTAJĄCA" : "SUMY OKRESÓW"}</span
      >
      <h2>{panel.unit}</h2>
    </div>
    <span class="plot-series-count"
      >{counted(panel.series.length, "licznik", "liczniki", "liczników")}</span
    >
  </div>
  <div class="plot-canvas" bind:clientWidth={containerWidth}>
    <svg
      class="chart-svg"
      viewBox={`0 0 ${width} 294`}
      role="img"
      aria-label={`Wykres licznika: ${panel.unit}`}
      onpointermove={inspect}
      onpointerdown={inspect}
    >
      <title>Wykres licznika: {panel.unit}</title>
      <desc
        >Zapisane sumy okresów. Luki oznaczają okresy bez zapisów. Użyj suwaka
        daty lub opcji Pokaż dane wykresu, aby zobaczyć dokładne wartości.</desc
      >
      {#each ticks as tick}
        <line
          x1={left}
          x2={right}
          y1={chartY(tick, domain.min, domain.max)}
          y2={chartY(tick, domain.min, domain.max)}
          class="grid-line"
        />
        <text
          x={left - 14}
          y={chartY(tick, domain.min, domain.max) + 4}
          text-anchor="end"
          class="axis-text">{chartValue(tick, true)}</text
        >
      {/each}
      {#if period}
        <line
          x1={chartX(index, count, width)}
          x2={chartX(index, count, width)}
          y1="24"
          y2="250"
          class="inspection-line"
        />
      {/if}
      {#each panel.series as row (chartSeriesKey(row.source))}
        <g
          data-series-key={chartSeriesKey(row.source)}
          class={`series-color-${row.color % 8}`}
        >
          <path
            d={chartLine(row.points, domain.min, domain.max, width)}
            class="series-line"
          />
          {#each row.points as point, i}
            {#if point.value !== null}
              <circle
                cx={chartX(i, count, width)}
                cy={chartY(point.value, domain.min, domain.max)}
                r={i === index ? 4.5 : count > 120 ? 1.8 : 3}
                class="series-dot"
              />
            {/if}
          {/each}
        </g>
      {/each}
      {#each labels as i}
        <text
          x={chartX(i, count, width)}
          y="279"
          text-anchor={count === 1
            ? "middle"
            : i === 0
              ? "start"
              : i === count - 1
                ? "end"
                : "middle"}
          class="axis-text">{chartDate(panel.series[0].points[i].from)}</text
        >
      {/each}
    </svg>
  </div>
  {#if period}
    <div class="inspection">
      <div class="inspection-label">
        <label for={inputId}>Sprawdź {panel.unit} datę</label>
        <strong
          >{chartDate(period.from, true)}{period.from !== period.to
            ? ` – ${chartDate(period.to, true)}`
            : ""}</strong
        >
      </div>
      <input
        id={inputId}
        aria-label={`Sprawdź ${panel.unit} datę`}
        type="range"
        min="0"
        max={Math.max(0, count - 1)}
        step="1"
        value={index}
        oninput={(event) => {
          inspected = Number(event.currentTarget.value);
        }}
      />
      <div class="inspection-values">
        {#each panel.series as row (chartSeriesKey(row.source))}
          {@const point = row.points[index]}
          <span class={`inspection-value series-color-${row.color % 8}`}>
            <span class="series-swatch" aria-hidden="true"></span>
            <span>{row.source.name}</span>
            <strong
              >{point.value === null
                ? "Brak zapisu"
                : `${chartValue(point.value)} ${panel.unit}`}</strong
            >
            {#if point.days > 1 && point.recorded > 0}<small
                >{point.recorded}/{point.days} dni z zapisami</small
              >{/if}
          </span>
        {/each}
      </div>
    </div>
  {/if}
  <details class="chart-data">
    <summary>Pokaż dane wykresu</summary>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable data table needs keyboard access.) -->
    <div
      class="data-scroll"
      tabindex="0"
      role="region"
      aria-label={`Tabela danych w ${panel.unit}`}
    >
      <table>
        <caption
          >Dokładne wartości wykresu w {panel.unit}. Kreska oznacza brak zapisu.</caption
        >
        <thead
          ><tr
            ><th scope="col">Okres</th>{#each panel.series as row}<th
                scope="col"
                >{row.source.name}<small>{row.source.card_title}</small></th
              >{/each}</tr
          ></thead
        >
        <tbody>
          {#each panel.series[0]?.points ?? [] as point, i}
            <tr>
              <th scope="row"
                >{chartDate(point.from, true)}{point.from !== point.to
                  ? ` – ${chartDate(point.to, true)}`
                  : ""}</th
              >
              {#each panel.series as row}<td
                  >{chartValue(row.points[i].value)}<small
                    >{row.points[i].recorded}/{point.days} dni z zapisami</small
                  ></td
                >{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</section>

<style>
  .chart-panel {
    min-width: 0;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    background: var(--paper);
    overflow: hidden;
  }
  .plot-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    padding: var(--space-9) var(--space-10) 0;
  }
  h2 {
    margin: var(--space-2) 0 0;
    font-size: var(--text-lg);
  }
  .plot-series-count {
    color: var(--muted);
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .chart-svg {
    width: 100%;
    display: block;
    height: 294px;
    touch-action: pan-y;
  }
  .grid-line {
    stroke: var(--line);
    stroke-width: 1;
  }
  .axis-text {
    fill: var(--muted);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
  }
  .inspection-line {
    stroke: var(--line-strong);
    stroke-width: 1;
    stroke-dasharray: 4 5;
  }
  .series-line {
    stroke: var(--series-color);
    stroke-width: 2.5;
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .series-dot {
    fill: var(--series-color);
    stroke: var(--paper);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .inspection {
    border-top: var(--stroke) solid var(--line);
    background: var(--soft);
    padding: var(--space-8) var(--space-10);
  }
  .inspection-label {
    display: flex;
    justify-content: space-between;
    gap: var(--space-8);
    flex-wrap: wrap;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .inspection-label strong {
    color: var(--ink);
    font-weight: var(--weight-medium);
  }
  input[type="range"] {
    width: 100%;
    min-height: var(--tap-target);
    padding: 0;
    border: 0;
    background: transparent;
  }
  .inspection-values {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5) var(--space-9);
  }
  .inspection-value {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--text-sm);
    flex-wrap: wrap;
  }
  .inspection-value strong {
    font-weight: var(--weight-semibold);
  }
  .inspection-value small {
    color: var(--muted);
  }
  .series-swatch {
    width: var(--space-4);
    height: var(--space-4);
    border-radius: 50%;
    background: var(--series-color);
    flex-shrink: 0;
  }
  .chart-data {
    padding: var(--space-6) var(--space-10);
    border-top: var(--stroke) solid var(--line);
    font-size: var(--text-sm);
  }
  summary {
    cursor: pointer;
    min-height: var(--tap-target);
    display: flex;
    align-items: center;
    gap: var(--space-4);
    color: var(--muted);
  }
  summary::before {
    content: "+";
    font-size: var(--text-lg);
  }
  details[open] summary::before {
    content: "−";
  }
  .data-scroll {
    max-height: 360px;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    text-align: left;
  }
  caption {
    text-align: left;
    color: var(--muted);
    padding: var(--space-4) 0 var(--space-8);
  }
  th,
  td {
    padding: var(--space-6) var(--space-8);
    border-bottom: var(--stroke) solid var(--line);
    white-space: nowrap;
  }
  th {
    font-weight: var(--weight-medium);
  }
  small {
    display: block;
    color: var(--muted);
    font-weight: var(--weight-normal);
  }
  @media (max-width: 700px) {
    .plot-heading {
      padding: var(--space-8) var(--space-8) 0;
    }
    .inspection,
    .chart-data {
      padding-left: var(--space-8);
      padding-right: var(--space-8);
    }
    .chart-svg {
      min-height: 170px;
    }
  }
</style>
