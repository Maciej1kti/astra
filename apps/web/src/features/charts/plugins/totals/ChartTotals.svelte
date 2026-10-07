<script lang="ts">
  import { chartValue } from "../../chart-model";
  import type { ChartPluginContext } from "../chart-plugins";
  import { chartTotals } from "./totals";

  let { rows, outputUnit }: ChartPluginContext = $props();
  const totals = $derived(chartTotals(rows));
  const valueUnit = $derived(outputUnit.trim() || "wartość");
</script>

<section class="chart-totals" aria-label="Razem" data-chart-totals>
  <h3>Razem</h3>
  <dl>
    {#if totals.total !== null}<div>
        <dt>Suma</dt>
        <dd>
          <strong data-chart-summary="total">{chartValue(totals.total)}</strong
          ><small>{totals.unit}</small>
        </dd>
      </div>{/if}
    <div>
      <dt>Dni z zapisami</dt>
      <dd>
        <span data-chart-summary="records">{chartValue(totals.records)}</span
        ><small>łącznie</small>
      </dd>
    </div>
    <div>
      <dt>Wartość</dt>
      <dd>
        <strong data-chart-summary="converted"
          >{totals.converted === null
            ? "—"
            : `${chartValue(totals.converted)} ${valueUnit}`}</strong
        ><small
          >{totals.rated
            ? `${totals.rated} z ${totals.counters} ze stawką`
            : "Żaden licznik nie ma stawki"}</small
        >
      </dd>
    </div>
  </dl>
</section>

<style>
  .chart-totals {
    margin-top: var(--space-6);
    padding: var(--space-6) var(--space-8) var(--space-7);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    background: var(--soft);
  }
  h3 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-12);
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  dt {
    color: var(--muted);
    font-size: var(--text-sm);
  }
  dd {
    margin: 0;
  }
  dd strong {
    font-weight: var(--weight-semibold);
  }
  dd small {
    display: block;
    color: var(--muted);
    font-size: var(--text-xs);
  }
</style>
