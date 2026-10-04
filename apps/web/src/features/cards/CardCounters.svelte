<script lang="ts">
  import { onMount, tick } from "svelte";
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
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
  let configurationName = $state<HTMLInputElement>();
  const visible = $derived(counters.filter((c) => showArchived || !c.archived));
  const canAdd = $derived(
    !disabled && saved && !draft.configuration && counters.length < 20,
  );
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
  async function configure(counter?: CardCounter) {
    draft.configuration = counter
      ? {
          id: counter.id,
          name: counter.name,
          unit: counter.unit,
          step: counter.step,
          archived: counter.archived,
        }
      : { name: "", unit: "reps", step: 1, archived: false };
    await tick();
    configurationName?.focus();
  }
</script>

<section
  class="card-counters"
  aria-label="Card counters"
  data-counter-today={today}
>
  <SectionHeading title="Counters" level={3} visuallyHidden />
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
          bind:this={configurationName}
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
  {/if}
  <div class="counter-actions">
    {#if counters.length === 0}
      <Button
        type="button"
        variant="quiet"
        disabled={!canAdd}
        onclick={() => void configure()}>Add counter</Button
      >
    {:else}
      <ActionMenu label="Counter actions">
        {#snippet children(close)}
          <Button
            type="button"
            variant="quiet"
            disabled={!canAdd}
            onclick={() => {
              close();
              void configure();
            }}>Add counter</Button
          >
          <Button
            type="button"
            variant="quiet"
            aria-pressed={showArchived}
            disabled={!counters.some((counter) => counter.archived)}
            onclick={() => {
              close();
              showArchived = !showArchived;
            }}
            ><span>Archived</span>{#if showArchived}<Icon
                name="check"
                small
              />{/if}</Button
          >
        {/snippet}
      </ActionMenu>
    {/if}
  </div>
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
  .counter-actions {
    display: flex;
    justify-content: flex-end;
    margin: var(--space-4) 0 0;
  }
  .counter-actions > :global(.ui-button) {
    padding-block: var(--space-4);
  }
  .counter-actions :global(.action-menu-panel button) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-4);
  }
  .counter-actions :global(button[aria-pressed="true"]) {
    background: var(--soft);
  }
  .counter-actions :global(button span) {
    flex: 1;
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
