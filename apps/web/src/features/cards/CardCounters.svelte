<script lang="ts">
  import { onMount } from "svelte";
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import CounterRow from "./CounterRow.svelte";
  import type {
    CardCounter,
    CardPatch,
  } from "../../lib/contracts/api.generated";
  import {
    counterDay,
    counterMaximum,
    validCounterConfiguration,
    type CounterDrafts,
  } from "./card-counters";

  let {
    counters,
    draft = $bindable(),
    timezone,
    disabled,
    saved,
    onsubmit,
  }: {
    counters: CardCounter[];
    draft: CounterDrafts;
    timezone: string;
    disabled: boolean;
    saved: boolean;
    onsubmit: (patch: CardPatch, counterId?: string) => void;
  } = $props();
  let now = $state(Date.now());
  const today = $derived(counterDay(timezone, now));
  let showArchived = $state(false);
  const visible = $derived(counters.filter((c) => showArchived || !c.archived));
  const unitLocked = $derived(
    !!draft.configuration?.id &&
      counters.some(
        (c) =>
          c.id === draft.configuration?.id && Object.keys(c.values).length > 0,
      ),
  );
  onMount(() => {
    const refresh = () => {
      now = Date.now();
    };
    const timer = setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  });
  function configure(counter?: CardCounter) {
    draft.configuration = counter
      ? {
          id: counter.id,
          name: counter.name,
          unit: counter.unit,
          step: counter.step,
          archived: counter.archived,
        }
      : { name: "", unit: "reps", step: 1, archived: false };
  }
</script>

<section
  class="card-counters"
  aria-label="Card counters"
  data-counter-today={today}
>
  <SectionHeading title="Counters" level={3}>
    {#snippet actions()}<Button
        type="button"
        variant="quiet"
        disabled={disabled ||
          !saved ||
          !!draft.configuration ||
          counters.length >= 20}
        onclick={() => configure()}
        ><Icon name="plus" small />Add counter</Button
      >
    {/snippet}
  </SectionHeading>
  {#if !saved}<p class="field-hint">
      Save the card title to add counters.
    </p>{/if}
  {#if draft.configuration}
    <div
      class="counter-configuration"
      role="group"
      aria-label="Counter configuration"
    >
      <label
        >Name<input
          aria-label="Counter name"
          maxlength="80"
          bind:value={draft.configuration.name}
          {disabled}
        /></label
      >
      <div class="configuration-fields">
        <label
          >Unit<input
            aria-label="Counter unit"
            maxlength="5"
            bind:value={draft.configuration.unit}
            disabled={disabled || unitLocked}
          /></label
        >
        <label
          >Step<input
            type="number"
            aria-label="Counter step"
            min="1"
            max={counterMaximum}
            step="1"
            bind:value={draft.configuration.step}
            {disabled}
          /></label
        >
      </div>
      {#if unitLocked}<p class="field-hint">
          Unit is fixed once results are recorded.
        </p>{/if}
      {#if draft.configuration.id}<label class="archive-counter"
          ><input
            type="checkbox"
            bind:checked={draft.configuration.archived}
            {disabled}
          /> Hide counter, keep history</label
        >{/if}
      <div class="row">
        <button
          type="button"
          class="primary"
          disabled={disabled || !validCounterConfiguration(draft.configuration)}
          onclick={() => {
            if (draft.configuration)
              onsubmit({
                configure_counter: {
                  ...draft.configuration,
                  name: draft.configuration.name.trim(),
                  unit: draft.configuration.unit.trim(),
                },
              });
          }}>Save counter</button
        >
        <button
          type="button"
          {disabled}
          onclick={() => {
            draft.configuration = null;
          }}>Cancel</button
        >
      </div>
    </div>
  {/if}
  {#if visible.length}
    <div class="counter-list">
      {#each visible as counter (counter.id)}
        <CounterRow
          {counter}
          bind:draft
          {today}
          {disabled}
          onconfigure={() => configure(counter)}
          {onsubmit}
        />
      {/each}
    </div>
    {#if visible.some((counter) => !counter.archived)}
      <p class="counter-help">Swipe a value left or right · Tap to type</p>
    {/if}
  {/if}
  {#if counters.some((c) => c.archived)}<button
      type="button"
      class="quiet"
      onclick={() => {
        showArchived = !showArchived;
      }}
      >{showArchived
        ? "Hide archived counters"
        : "Show archived counters"}</button
    >{/if}
  {#if counters.length >= 20}<p class="field-hint">
      This card has reached its 20-counter limit.
    </p>{/if}
</section>

<style>
  .card-counters {
    min-width: 0;
  }
  .counter-list {
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
  }
  .counter-help {
    margin: var(--space-4) 0 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .counter-configuration {
    background: var(--soft);
    border-radius: var(--radius-control);
    padding: var(--space-6);
    margin: var(--space-6) 0;
  }
  .configuration-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }
  label {
    margin-bottom: var(--space-5);
    min-width: 0;
  }
  input {
    width: 100%;
    min-width: 0;
  }
  .archive-counter {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .archive-counter input {
    width: auto;
  }
</style>
