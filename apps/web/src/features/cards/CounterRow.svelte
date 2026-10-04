<script lang="ts">
  import { tick } from "svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import Badge from "../../lib/ui/Badge.svelte";
  import type {
    CardCounter,
    CardPatch,
  } from "../../lib/contracts/api.generated";
  import CounterTrend from "./CounterTrend.svelte";
  import { counterScrub } from "./counter-scrub";
  import {
    counterRecord,
    counterMaximum,
    counterInputDirty,
    parseCounterInput,
    setCounterValue,
    setCounterInput,
    type CounterDrafts,
  } from "./card-counters";

  let {
    counter,
    draft = $bindable(),
    today,
    disabled,
    onconfigure,
    onsubmit,
  }: {
    counter: CardCounter;
    draft: CounterDrafts;
    today: string;
    disabled: boolean;
    onconfigure: () => void;
    onsubmit: (patch: CardPatch, counterId?: string) => void;
  } = $props();
  const id = $props.id();
  let entering = $state(false);
  let historyOpen = $state(false);
  let preview = $state<number | null>(null);
  let awaitingAck = $state(false);
  let input: HTMLInputElement | undefined = $state();
  let control: HTMLButtonElement | undefined = $state();
  const record = $derived(counterRecord(counter, draft, today));
  const textDraft = $derived(draft.inputs[counter.id]);
  const invalid = $derived(
    !!textDraft && parseCounterInput(textDraft.text) === null,
  );
  const changed = $derived(
    !!draft.values[counter.id] || (!!textDraft && counterInputDirty(textDraft)),
  );
  const editing = $derived(entering || !!textDraft);
  const value = $derived(preview ?? record.value);
  const locked = $derived(disabled || !!draft.configuration);
  const dates = $derived(
    historyOpen ? Object.keys(counter.values).sort().reverse() : [],
  );
  $effect(() => {
    if (awaitingAck && !changed && !textDraft && !disabled) {
      awaitingAck = false;
      void tick().then(() => control?.focus({ preventScroll: true }));
    }
  });

  function scrubOptions() {
    const observed = counter,
      day = record.date;
    return {
      value: record.value,
      step: counter.step,
      disabled: locked || counter.archived,
      preview: (next: number | null) => {
        preview = next;
      },
      commit: (next: number) => {
        draft = setCounterValue(observed, draft, day, next);
      },
    };
  }
  async function enter() {
    entering = true;
    await tick();
    input?.focus({ preventScroll: true });
    input?.select();
  }
  async function reset() {
    delete draft.values[counter.id];
    delete draft.inputs[counter.id];
    entering = false;
    await tick();
    control?.focus({ preventScroll: true });
  }
  function save() {
    if (locked || invalid || !draft.values[counter.id]) return;
    awaitingAck = true;
    entering = false;
    onsubmit({ record_counter: { ...record } }, counter.id);
  }
</script>

<div
  class="counter"
  class:editing={changed}
  role="group"
  aria-label={`Licznik: ${counter.name}`}
  data-counter-day={record.date}
>
  <div class="counter-overview">
    <button
      type="button"
      class="quiet counter-insight"
      aria-label={`${counter.name} — historia`}
      aria-expanded={historyOpen}
      aria-controls={`${id}-history`}
      title="Zapisane wyniki · Ostatnie 14 dni · Otwórz pełną historię"
      onclick={() => {
        historyOpen = !historyOpen;
      }}
    >
      <span class="counter-name"
        ><strong>{counter.name}</strong>{#if counter.archived}<Badge
            >Ukryty</Badge
          >{/if}</span
      >
      <CounterTrend values={counter.values} {today} />
      <span class="sr"
        >Zapisane wyniki z ostatnich 14 dni. Kropki oznaczają dni bez zapisów.</span
      >
    </button>
    {#if !counter.archived}
      {#if editing}
        <label class="counter-entry">
          <span class="sr">{counter.name} wynik</span>
          <input
            bind:this={input}
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="32"
            value={textDraft?.text ?? String(record.value)}
            aria-label={`${counter.name} wynik`}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : `${id}-entry-help`}
            disabled={locked}
            oninput={(event) => {
              draft = setCounterInput(
                counter,
                draft,
                record.date,
                event.currentTarget.value,
              );
            }}
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
              if (event.key === "Escape" && !disabled) {
                event.preventDefault();
                event.stopPropagation();
                void reset();
              }
            }}
          />
          <span class="counter-unit">{counter.unit}</span>
        </label>
      {:else}
        <button
          bind:this={control}
          type="button"
          class="counter-value"
          class:large={value >= 1_000_000}
          role="spinbutton"
          aria-label={`${counter.name} wynik`}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={counterMaximum}
          aria-valuetext={`${value} ${counter.unit}`}
          aria-describedby={`${id}-help`}
          disabled={locked}
          use:counterScrub={scrubOptions()}
          onclick={enter}
        >
          <strong>{value}</strong><span class="counter-unit"
            >{counter.unit}<span class="scrub-hint" aria-hidden="true">↔</span
            ></span
          >
        </button>
      {/if}
    {:else}<span class="counter-unit archived-total">{counter.unit}</span>{/if}
    <Button
      type="button"
      variant="quiet"
      class="icon-button"
      aria-label={`Edytuj licznik ${counter.name}`}
      title="Edytuj licznik"
      disabled={locked || changed || editing}
      onclick={onconfigure}><Icon name="settings" small /></Button
    >
  </div>
  <span class="sr" id={`${id}-help`}
    >Przeciągnij w lewo lub w prawo, użyj strzałek z krokiem {counter.step}, lub
    dotknij, aby wpisać liczbę całkowitą. Potwierdź, aby zapisać.</span
  >
  <span class="sr" id={`${id}-entry-help`}
    >Wpisz liczbę całkowitą w {counter.unit}. Naciśnij Enter, aby zapisać, lub
    Escape, aby anulować.</span
  >
  {#if changed || editing}
    <div class="counter-confirmation">
      <span class="draft-hint" role="status"
        >{record.date !== today
          ? `Niezapisany wynik na ${record.date}`
          : changed
            ? "Niezapisane"
            : "Wpisz wynik"}</span
      >
      <Button
        type="button"
        variant="quiet"
        aria-label="Odrzuć wersję roboczą"
        {disabled}
        onclick={reset}>Anuluj</Button
      >
      <Button
        type="button"
        variant="primary"
        aria-label={`Potwierdź ${counter.name}`}
        disabled={locked || invalid || !draft.values[counter.id]}
        onclick={save}><Icon name="check" small />Zapisz</Button
      >
    </div>
  {/if}
  {#if invalid}<p class="counter-error" role="alert" id={`${id}-error`}>
      Wpisz liczbę całkowitą od 0 do {counterMaximum.toLocaleString("pl-PL")}.
    </p>{/if}
  {#if historyOpen}
    <div class="counter-history-panel" id={`${id}-history`}>
      <div class="counter-history-heading">
        <strong>Historia</strong><span
          >{dates.length} {dates.length === 1 ? "dzień" : "dni"}</span
        >
      </div>
      <p class="field-hint">
        Zapisane wyniki dzienne. Podgląd obejmuje 14 dni; kropki oznaczają dni
        bez zapisów.
      </p>
      {#if dates.length}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable history needs keyboard access.) -->
        <div
          class="counter-history"
          tabindex="0"
          role="region"
          aria-label={`${counter.name} zapisanych wyników`}
        >
          <table>
            <thead><tr><th>Data</th><th>Wynik</th></tr></thead>
            <tbody
              >{#each dates as date}<tr
                  ><td><time datetime={date}>{date}</time></td><td
                    >{counter.values[date]} {counter.unit}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      {:else}<p class="field-hint">Brak zapisanych wyników.</p>{/if}
    </div>
  {/if}
</div>

<style>
  .counter {
    position: relative;
    min-width: 0;
    padding: var(--space-4);
    border-bottom: var(--stroke) solid var(--line);
  }
  .counter:last-child {
    border-bottom: 0;
  }
  .counter-overview {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto var(--tap-target);
    align-items: center;
    gap: var(--space-4);
  }
  .counter-insight {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    padding: var(--space-4);
    text-align: left;
    border-color: transparent;
  }
  .counter-name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    max-width: 100%;
  }
  .counter-name strong {
    font-size: var(--text-card);
    font-weight: var(--weight-semibold);
    overflow-wrap: anywhere;
  }
  .counter-value {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 76px;
    min-height: 60px;
    padding: var(--space-3) var(--space-4);
    border-color: transparent;
    background: var(--soft);
    cursor: ew-resize;
    touch-action: pan-y pinch-zoom;
    user-select: none;
    -webkit-user-select: none;
    font-variant-numeric: tabular-nums;
  }
  .counter-value strong {
    font-size: var(--text-title);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-tight);
  }
  .counter-value.large strong {
    font-size: var(--text-lg);
  }
  .counter-unit {
    font-size: var(--text-sm);
    color: var(--muted);
    line-height: var(--leading-body);
  }
  .scrub-hint {
    margin-left: var(--space-3);
    color: var(--muted);
  }
  .editing .counter-value,
  .counter-value:global([data-scrubbing]) {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent-ink);
  }
  .counter-value:global([data-scrubbing]) {
    cursor: grabbing;
  }
  .counter-entry {
    width: 112px;
    min-width: 0;
    margin: 0;
    text-align: center;
  }
  .counter-entry input {
    width: 100%;
    min-width: 0;
    margin: 0;
    padding-inline: var(--space-3);
    text-align: center;
    font-size: var(--text-lg);
    font-variant-numeric: tabular-nums;
  }
  .archived-total {
    padding: var(--space-4);
  }
  .counter-confirmation {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    flex-wrap: wrap;
  }
  .draft-hint {
    color: var(--muted);
    font-size: var(--text-sm);
    flex: 1;
    min-width: 60px;
  }
  .counter-error {
    color: var(--danger);
    font-size: var(--text-sm);
    margin: var(--space-2) var(--space-4) var(--space-4);
  }
  .counter-history-panel {
    margin: var(--space-4);
    padding-top: var(--space-6);
    border-top: var(--stroke) solid var(--line);
  }
  .counter-history-heading {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    font-size: var(--text-label);
  }
  .counter-history-heading span {
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .counter-history {
    max-height: 240px;
    overflow: auto;
    overscroll-behavior: contain;
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
  @media (prefers-reduced-motion: no-preference) {
    .counter-confirmation,
    .counter-history-panel {
      animation: astra-reveal var(--motion-detail) var(--motion-emerge);
    }
    .counter-value {
      transition:
        background var(--motion-quick),
        border-color var(--motion-quick),
        color var(--motion-quick);
    }
  }
  @media (min-width: 641px) {
    .counter-insight {
      flex-direction: row;
      align-items: center;
      gap: var(--space-6);
    }
    .counter-name {
      flex: 1;
    }
    .counter-insight :global(.counter-trend) {
      flex-shrink: 0;
    }
  }
</style>
