<script lang="ts">
  import { chartDate } from "../../chart-model";
  import type { ChartPluginContext } from "../chart-plugins";
  import { money, settle } from "./settlement";

  let { rows, outputUnit }: ChartPluginContext = $props();

  const settlement = $derived(settle(rows));
  const unit = $derived(outputUnit.trim());
  const first = $derived(
    rows
      .flatMap((row) => row.source.history?.first_date ?? [])
      .reduce<string | null>(
        (earliest, date) => (!earliest || date < earliest ? date : earliest),
        null,
      ),
  );
</script>

{#if settlement.people > 1}
  <section class="chart-settlement" aria-labelledby="chart-settlement-heading">
    <div class="settlement-heading">
      <h2 id="chart-settlement-heading">Rozliczenie</h2>
      <p data-chart-ledger>
        {first
          ? `cała historia, od ${chartDate(first, true)}`
          : "cała historia"}
      </p>
    </div>
    {#if settlement.parties.length > 1}
      {#if settlement.debts.length}
        <ul class="settlement-debts">
          {#each settlement.debts as debt (`${debt.from}/${debt.to}`)}
            <li data-chart-debt>
              <span class="debt-who"
                ><b>{debt.from}</b> płaci <span aria-hidden="true">→</span><span
                  class="spoken">, dostaje</span
                >
                <b>{debt.to}</b></span
              >
              <strong class="debt-amount"
                >{money(debt.amount)}{#if unit}<small>{unit}</small
                  >{/if}</strong
              >
            </li>
          {/each}
        </ul>
      {:else}
        <p class="settlement-even">Nikt nikomu nie wisi: wartości są równe.</p>
      {/if}
      <dl class="settlement-parties">
        {#each settlement.parties as party (party.name)}
          <div data-chart-party={party.name}>
            <dt>{party.name}</dt>
            <dd>{money(party.value)}{unit ? ` ${unit}` : ""}</dd>
          </div>
        {/each}
      </dl>
      {#if settlement.unrated}<p class="settlement-note">
          Liczniki bez stawki ({settlement.unrated}) nie wchodzą do rozliczenia.
        </p>{/if}
    {:else}
      <p class="settlement-note">
        Ustaw stawki w ustawieniach liczników na karcie, aby policzyć, kto komu
        wisi.
      </p>
    {/if}
  </section>
{/if}

<style>
  .chart-settlement {
    margin-bottom: var(--space-6);
    padding: var(--space-8) var(--space-9);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    background: var(--paper);
  }
  .settlement-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-8);
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
  }
  .settlement-heading p {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .settlement-debts {
    display: grid;
    gap: var(--space-4);
    margin: var(--space-6) 0 0;
    padding: 0;
    list-style: none;
  }
  .settlement-debts li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-8);
  }
  .debt-who {
    font-size: var(--text-lg);
    overflow-wrap: anywhere;
  }
  .debt-who b {
    font-weight: var(--weight-semibold);
  }
  .spoken {
    position: absolute;
    width: var(--stroke);
    height: var(--stroke);
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .debt-amount {
    font-size: var(--text-title);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tracking-tight);
    white-space: nowrap;
  }
  /* Further pairs stay readable without competing with the largest debt. */
  .settlement-debts li + li .debt-amount {
    font-size: var(--text-xl);
  }
  .debt-amount small {
    margin-left: var(--space-2);
    color: var(--muted);
    font-size: var(--text-base);
    font-weight: var(--weight-normal);
    letter-spacing: 0;
  }
  .settlement-even {
    margin: var(--space-6) 0 0;
    font-size: var(--text-lg);
  }
  .settlement-parties {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-10);
    margin: var(--space-6) 0 0;
    padding-top: var(--space-6);
    border-top: var(--stroke) solid var(--line);
  }
  .settlement-parties div {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
  }
  dt {
    color: var(--muted);
    font-size: var(--text-base);
  }
  dd {
    margin: 0;
    font-weight: var(--weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .settlement-note {
    max-width: var(--measure);
    margin: var(--space-4) 0 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  @container chart (max-width: 520px) {
    .chart-settlement {
      padding: var(--space-7) var(--space-8);
    }
  }
</style>
