<script lang="ts">
  import { counterTrend } from "./counter-trend";

  let { values, today }: { values: Record<string, number>; today: string } =
    $props();
  const days = $derived(counterTrend(values, today));
  const peak = $derived(Math.max(1, ...days.map((day) => day.value ?? 0)));
</script>

<svg class="counter-trend" viewBox="0 0 112 26" aria-hidden="true">
  {#each days as day, index}
    {#if day.value === null}
      <circle cx={index * 8 + 3.5} cy="24" r="1" class="missing" />
    {:else}
      {@const height = Math.max(2, (day.value / peak) * 24)}
      <rect
        x={index * 8 + 1}
        y={25 - height}
        width="5"
        {height}
        rx="2"
        class:today={day.date === today}
        class:zero={day.value === 0}
      />
    {/if}
  {/each}
</svg>

<style>
  .counter-trend {
    display: block;
    width: 112px;
    max-width: 100%;
    height: 26px;
    overflow: visible;
  }
  rect {
    fill: color-mix(in srgb, var(--accent-ink) 52%, var(--paper));
  }
  rect.today {
    fill: var(--accent-ink);
  }
  rect.zero {
    fill: var(--muted);
  }
  .missing {
    fill: var(--line-strong);
  }
</style>
