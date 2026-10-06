<script lang="ts">
  import {
    chartBand,
    chartBar,
    chartBarLayout,
    chartDate,
    chartDomain,
    chartFrame,
    chartIndex,
    chartLine,
    chartSeriesKey,
    chartStepLine,
    chartTicks,
    chartValue,
    chartX,
    chartY,
    type ChartBucket,
    type ChartPanel,
    type ChartPeriod,
    type ChartScale,
  } from "./chart-model";

  let {
    panel,
    cumulative,
    bucket,
    scale,
  }: {
    panel: ChartPanel;
    cumulative: boolean;
    bucket: ChartBucket;
    scale: ChartScale;
  } = $props();

  let inspected = $state<number | null>(null);
  let containerWidth = $state(920);
  const width = $derived(Math.max(240, containerWidth));
  const height = $derived(width < 550 ? 220 : 300);
  const frame = $derived(chartFrame(width, height));
  const periods = $derived<ChartPeriod[]>(panel.series[0]?.points ?? []);
  const count = $derived(periods.length);
  const band = $derived(chartBand(count, frame));
  const bars = $derived(
    cumulative ? null : chartBarLayout(band, panel.series.length),
  );
  const ticks = $derived.by(() => {
    const domain = chartDomain(panel);
    return chartTicks(domain.min, domain.max);
  });
  const min = $derived(ticks[0] ?? 0);
  const max = $derived(ticks.at(-1) ?? 1);
  const baseline = $derived(
    chartY(Math.min(Math.max(0, min), max), min, max, frame),
  );
  // At rest the readout shows the latest period that holds a recording.
  const latest = $derived.by(() => {
    for (let index = count - 1; index >= 0; index--)
      if (panel.series.some((row) => row.points[index]?.value !== null))
        return index;
    return Math.max(0, count - 1);
  });
  const index = $derived(
    Math.min(Math.max(0, inspected ?? latest), Math.max(0, count - 1)),
  );
  const period = $derived(periods[index]);
  const labels = $derived.by(() => {
    const room = Math.max(2, Math.floor((frame.right - frame.left) / 76));
    const step = Math.max(1, Math.ceil(count / room));
    const picked: number[] = [];
    // Count back from the latest period, which readers look for first.
    for (let position = count - 1; position >= 0; position -= step)
      picked.unshift(position);
    return picked;
  });
  const repeated = $derived(
    new Set(
      panel.series
        .map((row) => row.source.name)
        .filter((name, position, names) => names.indexOf(name) !== position),
    ),
  );
  const mode = $derived(
    cumulative
      ? "suma narastająca"
      : bucket === "week"
        ? "sumy tygodniowe"
        : bucket === "month"
          ? "sumy miesięczne"
          : "sumy dzienne",
  );
  const suffix = $derived(scale === "relative" ? "%" : "");
  // The slider announces what the legend shows for the same period.
  const reading = $derived(
    period
      ? `${span(period)}: ${panel.series
          .map((row) => {
            const point = row.points[index];
            const value = point?.value ?? point?.carried ?? null;
            return `${row.source.name} ${
              value === null ? "brak zapisu" : `${chartValue(value)}${suffix}`
            }`;
          })
          .join(", ")}`
      : "",
  );

  function span(value: ChartPeriod): string {
    return `${chartDate(value.from, true)}${
      value.from !== value.to ? ` – ${chartDate(value.to, true)}` : ""
    }`;
  }
  function inspect(event: PointerEvent) {
    const bounds = (event.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * width;
    inspected = chartIndex(x, count, frame);
  }
</script>

<section class="chart-panel" aria-label={`Wykres w ${panel.unit}`}>
  <div class="plot-heading">
    <h2>{panel.unit}<small data-plot-mode>{mode}</small></h2>
    {#if period}<p class="plot-period">{span(period)}</p>{/if}
  </div>
  {#if period}
    <ul class="plot-legend" aria-label="Wartości we wskazanym okresie">
      {#each panel.series as row (chartSeriesKey(row.source))}
        {@const point = row.points[index]}
        {#if point}<li class={`series-color-${row.color % 8}`}>
            <span class="series-key" class:line={!bars} aria-hidden="true"
            ></span>
            <span class="legend-name"
              >{row.source.name}{#if repeated.has(row.source.name)}<small
                  >{row.source.card_title}</small
                >{/if}</span
            >
            <span class="legend-value">
              {#if point.value !== null}<strong
                  >{chartValue(point.value)}{suffix}</strong
                >{#if point.days > 1}<small
                    >{point.recorded} z {point.days} dni</small
                  >{/if}
              {:else if point.carried !== null}<strong class="held"
                  >{chartValue(point.carried)}{suffix}</strong
                ><small>bez zapisu</small>
              {:else}<small>Brak zapisu</small>{/if}
            </span>
          </li>{/if}
      {/each}
    </ul>
  {/if}
  <div class="plot-canvas">
    <!-- Width is read from an element whose own size the plot cannot change:
         measuring the canvas would observe the height this sets. -->
    <div class="plot-measure" bind:clientWidth={containerWidth}></div>
    <svg
      class="chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      {height}
      role="img"
      aria-label={`Wykres licznika: ${panel.unit}`}
      onpointerdown={inspect}
      onpointermove={inspect}
      onpointerleave={(event) => {
        if (event.pointerType === "mouse") inspected = null;
      }}
    >
      <title>Wykres licznika: {panel.unit}</title>
      <desc
        >Zapisane {mode}. Okresy bez zapisów pozostają puste. Wskaż okres myszą,
        dotykiem albo strzałkami, lub otwórz dane wykresu, aby zobaczyć dokładne
        wartości.</desc
      >
      {#if period}
        {#if bars}<rect
            class="inspection-band"
            x={frame.left + index * band}
            y={frame.top}
            width={band}
            height={frame.bottom - frame.top}
          />{:else}<line
            class="inspection-line"
            x1={chartX(index, count, frame)}
            x2={chartX(index, count, frame)}
            y1={frame.top}
            y2={frame.bottom}
          />{/if}
      {/if}
      {#each ticks as tick (tick)}
        <line
          x1={frame.left}
          x2={frame.right}
          y1={chartY(tick, min, max, frame)}
          y2={chartY(tick, min, max, frame)}
          class="grid-line"
          class:zero={tick === 0}
        />
        <text
          x={frame.left - 10}
          y={chartY(tick, min, max, frame) + 4}
          text-anchor="end"
          class="axis-text">{chartValue(tick, true)}{suffix}</text
        >
      {/each}
      {#each panel.series as row, position (chartSeriesKey(row.source))}
        <g
          data-series-key={chartSeriesKey(row.source)}
          class={`series-color-${row.color % 8}`}
        >
          {#if bars}
            {@const group =
              panel.series.length * bars.width +
              (panel.series.length - 1) * bars.gap}
            {#each row.points as point, i (point.from)}
              {#if point.value !== null}<path
                  data-point
                  class="series-bar"
                  d={chartBar(
                    chartX(i, count, frame) -
                      group / 2 +
                      position * (bars.width + bars.gap),
                    bars.width,
                    baseline,
                    chartY(point.value, min, max, frame),
                  )}
                />{/if}
            {/each}
          {:else}
            <path
              class="series-line"
              d={cumulative
                ? chartStepLine(row.points, min, max, frame)
                : chartLine(row.points, min, max, frame)}
            />
            {#each row.points as point, i (point.from)}
              {#if point.value !== null}<circle
                  data-point
                  class="series-dot"
                  cx={chartX(i, count, frame)}
                  cy={chartY(point.value, min, max, frame)}
                  r={i === index ? 5 : count > 120 ? 2 : count > 45 ? 3 : 4}
                />{/if}
            {/each}
          {/if}
        </g>
      {/each}
      {#each labels as i (i)}
        {@const start = periods[i]?.from}
        {#if start}<text
            x={band < 48 && i === count - 1
              ? frame.right
              : chartX(i, count, frame)}
            y={frame.bottom + 20}
            text-anchor={band < 48 && i === count - 1 ? "end" : "middle"}
            class="axis-text">{chartDate(start)}</text
          >{/if}
      {/each}
    </svg>
    {#if period}<input
        class="plot-scrubber"
        aria-label={`Wskazany okres: ${panel.unit}`}
        aria-valuetext={reading}
        type="range"
        min="0"
        max={Math.max(0, count - 1)}
        step="1"
        value={index}
        oninput={(event) => {
          inspected = Number(event.currentTarget.value);
        }}
      />{/if}
  </div>
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
            ><th scope="col">Okres</th
            >{#each panel.series as row (chartSeriesKey(row.source))}<th
                scope="col"
                >{row.source.name}<small>{row.source.card_title}</small></th
              >{/each}</tr
          ></thead
        >
        <tbody>
          {#each periods as point, i (point.from)}
            <tr>
              <th scope="row">{span(point)}</th>
              {#each panel.series as row (chartSeriesKey(row.source))}
                {@const cell = row.points[i]}
                <td
                  >{#if cell}{chartValue(cell.value)}<small
                      >{cell.recorded}/{point.days} dni z zapisami</small
                    >{/if}</td
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
  }
  .plot-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-8);
    padding: var(--space-8) var(--space-9) 0;
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
    overflow-wrap: anywhere;
  }
  h2 small {
    margin-left: var(--space-4);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
  }
  .plot-period {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .plot-legend {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-2) var(--space-8);
    margin: 0;
    padding: var(--space-6) var(--space-9) var(--space-2);
    list-style: none;
  }
  .plot-legend li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-4);
    min-width: 0;
  }
  .series-key {
    width: var(--space-5);
    height: var(--space-5);
    border-radius: var(--radius-sm);
    background: var(--series-color);
  }
  .series-key.line {
    width: var(--space-7);
    height: 3px;
    border-radius: var(--radius-pill);
  }
  .legend-name {
    color: var(--muted);
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .legend-name small {
    margin-left: var(--space-2);
    font-size: var(--text-xs);
  }
  .legend-value {
    grid-column: 2;
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    font-size: var(--text-card);
    font-variant-numeric: tabular-nums;
  }
  .legend-value strong {
    font-weight: var(--weight-semibold);
  }
  .legend-value strong.held {
    font-weight: var(--weight-normal);
  }
  .legend-value small {
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .plot-canvas {
    position: relative;
    margin: 0 var(--space-4);
    border-radius: var(--radius-control);
  }
  .plot-measure {
    height: 0;
  }
  .plot-canvas:has(.plot-scrubber:focus-visible) {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: 0;
  }
  .chart-svg {
    display: block;
    width: 100%;
    touch-action: pan-y;
    cursor: crosshair;
  }
  /* The slider is the keyboard and assistive route to the pointer readout. */
  .plot-scrubber {
    position: absolute;
    inset: auto 0 0;
    width: 100%;
    height: var(--stroke);
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    pointer-events: none;
  }
  .grid-line {
    stroke: var(--line);
    stroke-width: 1;
  }
  .grid-line.zero {
    stroke: var(--line-strong);
  }
  .axis-text {
    fill: var(--muted);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  .inspection-band {
    fill: var(--soft);
  }
  .inspection-line {
    stroke: var(--line-strong);
    stroke-width: 1;
  }
  .series-bar {
    fill: var(--series-color);
  }
  .series-line {
    stroke: var(--series-color);
    stroke-width: 2;
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .series-dot {
    fill: var(--series-color);
    stroke: var(--paper);
    stroke-width: 2;
  }
  .chart-data {
    margin-top: var(--space-2);
    padding: 0 var(--space-9);
    border-top: var(--stroke) solid var(--line);
    font-size: var(--text-label);
  }
  summary {
    cursor: pointer;
    min-height: var(--tap-target);
    display: flex;
    align-items: center;
    gap: var(--space-4);
    color: var(--muted);
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: "";
    width: var(--space-3);
    height: var(--space-3);
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
  }
  details[open] summary::before {
    transform: rotate(45deg);
  }
  .data-scroll {
    max-height: 360px;
    overflow: auto;
    margin-bottom: var(--space-8);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;
    text-align: left;
  }
  caption {
    text-align: left;
    color: var(--muted);
    padding: 0 0 var(--space-6);
  }
  th,
  td {
    padding: var(--space-4) var(--space-8) var(--space-4) 0;
    border-bottom: var(--stroke) solid var(--line);
    white-space: nowrap;
  }
  th {
    font-weight: var(--weight-medium);
  }
  th small,
  td small {
    display: block;
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-normal);
  }
  @container chart (max-width: 520px) {
    .plot-heading {
      padding: var(--space-7) var(--space-8) 0;
    }
    .plot-legend {
      grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
      padding-inline: var(--space-8);
    }
    .plot-canvas {
      margin-inline: var(--space-2);
    }
    .chart-data {
      padding-inline: var(--space-8);
    }
  }
</style>
