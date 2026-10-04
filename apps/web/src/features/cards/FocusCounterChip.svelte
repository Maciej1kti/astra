<script lang="ts">
  import type { Summary } from "../../lib/api/api";
  import type { DailyCounterSummary } from "../../lib/contracts/api.generated";
  import { counterScrub } from "./counter-scrub";
  import {
    counterLimit,
    matchesCounter,
    type FocusCounterSnapshot,
  } from "./focus-counter-controller";
  let {
    item,
    counter,
    snapshot,
    today,
    onchange,
  }: {
    item: Summary;
    counter: DailyCounterSummary;
    snapshot: FocusCounterSnapshot;
    today: string;
    onchange: (
      item: Summary,
      counter: DailyCounterSummary,
      value: number,
      focus?: boolean,
    ) => void;
  } = $props();
  const id = $props.id();
  let preview = $state<number | null>(null);
  const current = $derived(matchesCounter(snapshot.draft, item, counter));
  const observed = $derived(current ? snapshot.draft!.counter : counter);
  const value = $derived(
    preview ?? (current ? snapshot.draft!.value : counter.value),
  );
  const disabled = $derived(
    !!snapshot.pending ||
      snapshot.rejected ||
      (!!snapshot.draft && !current) ||
      item.availability !== "ready" ||
      (!current && counter.date !== today),
  );
  function options() {
    const observedItem = item,
      observedCounter = counter;
    return {
      value: current ? snapshot.draft!.value : counter.value,
      step: observed.step,
      disabled,
      preview: (next: number | null) => {
        preview = next;
      },
      commit: (next: number) => onchange(observedItem, observedCounter, next),
    };
  }
</script>

<div
  class="focus-counter-chip"
  class:editing={current}
  class:long={counter.name.length > 24}
  data-focus-interactive
>
  <span class="focus-counter-name" id={`${id}-name`} title={observed.name}
    >{observed.name}</span
  >
  {#if current && observed.date !== today}<small
      class="focus-counter-draft-date">{observed.date}</small
    >{/if}
  <button
    type="button"
    class="focus-counter-value"
    role="spinbutton"
    aria-labelledby={`${id}-name`}
    aria-describedby={`${id}-help`}
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={counterLimit}
    aria-valuetext={`${value} ${observed.unit}`}
    {disabled}
    use:counterScrub={options()}
    onclick={() => onchange(item, counter, value, true)}
    ><strong>{value}</strong><span>{observed.unit}</span><span
      class="scrub-hint"
      aria-hidden="true">↔</span
    ></button
  >
  <span id={`${id}-help`} class="sr"
    >Przeciągnij w lewo lub w prawo, użyj strzałek z krokiem {observed.step}lub
    dotknij, aby wpisać wartość. Potwierdź, aby zapisać.</span
  >
</div>
