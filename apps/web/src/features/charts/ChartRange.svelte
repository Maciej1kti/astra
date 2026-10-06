<script lang="ts">
  import type { Snippet } from "svelte";
  import Button from "../../lib/ui/Button.svelte";
  import { calendarShift } from "../../lib/ui/calendar-grid";
  import ChartMenu from "./ChartMenu.svelte";
  import ChartSegments from "./ChartSegments.svelte";
  import { chartRangeDays } from "./chart-model";

  let {
    from,
    to,
    today,
    compact = false,
    onrangechange,
    children,
  }: {
    from: string;
    to: string;
    today: string;
    /** One row of menus, for a phone, instead of the segmented presets. */
    compact?: boolean;
    onrangechange: (from: string, to: string) => void;
    /** Further controls that share the compact row. */
    children?: Snippet;
  } = $props();

  const presets = [
    { value: 7, label: "7 dni" },
    { value: 30, label: "30 dni" },
    { value: 90, label: "90 dni" },
    { value: 365, label: "1 rok" },
  ];
  let custom = $state(false);
  let draftFrom = $state("");
  let draftTo = $state("");
  let rangeError = $state("");

  $effect(() => {
    draftFrom = from;
    draftTo = to;
    rangeError = "";
  });

  const preset = $derived(
    presets.find(
      (option) =>
        to === today && from === calendarShift(today, 1 - option.value),
    )?.value ?? null,
  );

  function choose(count: number) {
    const start = calendarShift(today, 1 - count);
    if (!start) return;
    custom = false;
    onrangechange(start, today);
  }
  function apply() {
    const count = chartRangeDays(draftFrom, draftTo);
    if (!count || count > 400) {
      rangeError =
        "Wybierz prawidłowy zakres do 400 dni. Koniec musi następować po początku.";
      return;
    }
    rangeError = "";
    onrangechange(draftFrom, draftTo);
  }
</script>

<div class="chart-range" class:compact>
  {#if compact}
    <div class="range-row">
      <ChartMenu
        label="Zakres dat"
        options={[...presets, { value: 0, label: "Własny" }]}
        value={custom ? 0 : (preset ?? 0)}
        onselect={(count) => {
          if (count) choose(count);
          else custom = true;
        }}
      />
      {@render children?.()}
    </div>
  {:else}
    <div class="range-presets">
      <ChartSegments
        label="Zakres dat"
        options={presets}
        value={preset}
        onselect={choose}
      >
        <button
          type="button"
          class:active={preset === null}
          aria-expanded={custom}
          aria-controls="chart-custom-range"
          onclick={() => {
            custom = !custom;
          }}>Własny</button
        >
      </ChartSegments>
    </div>
  {/if}
  {#if custom}
    <form
      id="chart-custom-range"
      class="range-form"
      onsubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label>Od<input type="date" bind:value={draftFrom} /></label>
      <label>Do<input type="date" bind:value={draftTo} /></label>
      <Button type="submit">Zastosuj zakres</Button>
    </form>
    {#if rangeError}<p class="notice" role="alert">{rangeError}</p>{/if}
  {/if}
</div>

<style>
  .chart-range {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-6);
    min-width: 0;
  }
  .chart-range.compact {
    align-items: stretch;
  }
  .range-row {
    display: flex;
    gap: var(--space-4);
    min-width: 0;
  }
  .range-presets {
    max-width: 100%;
  }
  .range-form {
    display: flex;
    align-items: end;
    gap: var(--space-6);
  }
  .range-form label {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .range-form input {
    width: var(--field-min-width);
    font-size: var(--text-base);
  }
  .notice {
    margin: 0;
    font-size: var(--text-base);
  }
  @container chart (max-width: 620px) {
    .chart-range {
      width: 100%;
      align-items: stretch;
    }
    .range-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .range-form input {
      width: 100%;
    }
    .range-form :global(button) {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 700px) {
    .range-form input {
      font-size: var(--text-lg);
    }
  }
</style>
