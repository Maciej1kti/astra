<script lang="ts">
  import { onMount } from "svelte";
  import type {
    CardCounter,
    CardPatch,
  } from "../../lib/contracts/api.generated";
  import {
    adjustCounter,
    counterDay,
    counterRecord,
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
  function adjust(counter: CardCounter, direction: 1 | -1) {
    now = Date.now();
    draft = adjustCounter(counter, draft, counterDay(timezone, now), direction);
  }
</script>

<section class="card-counters" aria-label="Card counters">
  <div class="section-heading">
    <h3>Counters</h3>
    <button
      type="button"
      class="quiet"
      disabled={disabled ||
        !saved ||
        !!draft.configuration ||
        counters.length >= 20}
      onclick={() => configure()}>Add counter</button
    >
  </div>
  {#if counters.length}<p class="field-hint">
      Today · <time datetime={today}>{today}</time> · {timezone}
    </p>{/if}
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
  {#each visible as counter (counter.id)}
    {@const record = counterRecord(counter, draft, today)}
    {@const dates = Object.keys(counter.values).sort().reverse()}
    <div class="counter" role="group" aria-label={`Counter: ${counter.name}`}>
      <div class="counter-heading">
        <strong>{counter.name}</strong>
        {#if counter.archived}<span class="badge">Hidden</span>{/if}
        <button
          type="button"
          class="quiet"
          aria-label={`Edit counter ${counter.name}`}
          disabled={disabled ||
            !!draft.configuration ||
            !!draft.values[counter.id]}
          onclick={() => configure(counter)}>Edit</button
        >
      </div>
      {#if !counter.archived}
        <div class="counter-controls">
          <button
            type="button"
            aria-label={`Decrease ${counter.name} by ${counter.step}`}
            disabled={disabled || !!draft.configuration || record.value === 0}
            onclick={() => adjust(counter, -1)}>−</button
          >
          <output aria-label={`${counter.name} value`} aria-live="polite"
            >{record.value}</output
          >
          <button
            type="button"
            aria-label={`Increase ${counter.name} by ${counter.step}`}
            disabled={disabled ||
              !!draft.configuration ||
              record.value >= counterMaximum}
            onclick={() => adjust(counter, 1)}>+</button
          >
          <span class="unit">{counter.unit}</span>
          <button
            type="button"
            class="primary"
            aria-label={`Confirm ${counter.name}`}
            disabled={disabled ||
              !!draft.configuration ||
              !draft.values[counter.id]}
            onclick={() =>
              onsubmit({ record_counter: { ...record } }, counter.id)}
            >OK</button
          >
        </div>
        {#if draft.values[counter.id]}
          <div class="draft-hint">
            <span
              >{record.date !== today
                ? `Unsaved result for ${record.date}`
                : "Not saved"}</span
            ><button
              type="button"
              class="quiet"
              {disabled}
              onclick={() => {
                delete draft.values[counter.id];
              }}>Reset draft</button
            >
          </div>
        {/if}
      {/if}
      {#if dates.length}<details>
          <summary
            >History · {dates.length}
            {dates.length === 1 ? "day" : "days"}</summary
          >
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable history needs keyboard access.) -->
          <div
            class="counter-history"
            tabindex="0"
            role="region"
            aria-label={`${counter.name} history`}
          >
            <table>
              <thead><tr><th>Date</th><th>Result</th></tr></thead><tbody
                >{#each dates as date}<tr
                    ><td><time datetime={date}>{date}</time></td><td
                      >{counter.values[date]} {counter.unit}</td
                    ></tr
                  >{/each}</tbody
              >
            </table>
          </div>
        </details>{/if}
    </div>
  {/each}
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
    margin-top: var(--space-10);
    padding-top: var(--space-8);
    border-top: var(--stroke) solid var(--line);
  }
  .section-heading,
  .counter-heading,
  .draft-hint {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  h3 {
    font-size: var(--text-section);
    margin: 0;
  }
  .section-heading > button,
  .counter-heading > button {
    margin-left: auto;
  }
  .counter {
    padding: var(--space-6) 0;
    border-bottom: var(--stroke) solid var(--line);
  }
  .counter-heading strong {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .counter-controls {
    display: grid;
    grid-template-columns: 44px minmax(40px, 1fr) 44px minmax(30px, auto) 44px;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-3) 0;
    max-width: 420px;
  }
  .counter-controls button {
    padding: 0;
    min-height: 44px;
  }
  output {
    text-align: center;
    font-size: var(--text-xl);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .unit {
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
  }
  .draft-hint {
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
  summary {
    padding: var(--space-4) 0;
    font-size: var(--text-sm);
    color: var(--muted);
    cursor: pointer;
  }
  .counter-history {
    max-height: 240px;
    overflow: auto;
  }
  table {
    width: 100%;
    font-size: var(--text-sm);
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: var(--space-4);
    border-bottom: var(--stroke) solid var(--line);
  }
  th:last-child,
  td:last-child {
    text-align: right;
  }
</style>
