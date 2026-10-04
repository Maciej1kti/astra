<script lang="ts">
  import { tick } from "svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import {
    counterLimit,
    counterValueValid,
    type FocusCounterSnapshot,
  } from "./focus-counter-controller";
  let {
    snapshot,
    connected,
    today,
    onchange,
    onsave,
    onretry,
    oncheck,
    oncancel,
  }: {
    snapshot: FocusCounterSnapshot;
    connected: boolean;
    today: string;
    onchange: (value: number) => void;
    onsave: () => void;
    onretry: () => void;
    oncheck: () => void;
    oncancel: () => void;
  } = $props();
  let input: HTMLInputElement | undefined = $state();
  let invalid = $state(false);
  let copied = $state("");
  $effect(() => {
    snapshot.draft;
    invalid = false;
    copied = "";
  });
  export async function focusValue() {
    await tick();
    input?.focus();
    input?.select();
  }
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(snapshot.pending, null, 2),
      );
      copied = "Skopiowano polecenie";
    } catch {
      copied = "Nie udało się skopiować. Zaznacz szczegóły polecenia poniżej.";
    }
  }
</script>

{#if snapshot.draft}
  {@const draft = snapshot.draft}
  <section
    class="focus-counter-bar"
    aria-label="Edytuj licznik Focus"
    data-focus-interactive
  >
    <div class="focus-counter-bar-heading">
      <strong>{draft.counter.name}</strong>
      <span title={draft.title}>{draft.title}</span>
      <small
        >{draft.counter.date === today ? "Dzisiaj" : draft.counter.date} · {draft
          .counter.unit}</small
      >
    </div>
    <div
      class="focus-counter-bar-controls"
      class:recovering={!!snapshot.pending || snapshot.rejected}
    >
      <input
        bind:this={input}
        type="number"
        inputmode="numeric"
        min="0"
        max={counterLimit}
        step="1"
        value={draft.value}
        aria-label={`${draft.counter.name} wynik`}
        aria-invalid={invalid}
        disabled={!!snapshot.pending || snapshot.rejected}
        oninput={(event) => {
          const value = event.currentTarget.valueAsNumber;
          invalid = !counterValueValid(value);
          if (!invalid) onchange(value);
        }}
        onkeydown={(event) => {
          if (event.key === "Enter" && !invalid) onsave();
          if (event.key === "Escape" && !snapshot.pending) {
            event.preventDefault();
            oncancel();
          }
        }}
      />
      {#if snapshot.pending}
        <Button
          variant="primary"
          disabled={snapshot.busy || !connected}
          onclick={onretry}
          >{snapshot.busy ? "Zapisywanie…" : "Ponów to samo polecenie"}</Button
        >
      {:else if snapshot.rejected}
        <Button onclick={oncancel}>Odrzuć i odśwież</Button>
      {:else}
        <Button
          variant="quiet"
          aria-label="Anuluj edycję licznika"
          onclick={oncancel}><Icon name="close" small /></Button
        >
        <Button
          variant="primary"
          disabled={invalid ||
            !connected ||
            draft.value === draft.counter.value}
          onclick={onsave}><Icon name="check" small />Zapisz</Button
        >
      {/if}
    </div>
    {#if snapshot.error}<p role="alert">
        {snapshot.error}
        {snapshot.pending
          ? "Pierwotne polecenie zostało zachowane."
          : "Wartość pozostaje powyżej. Odrzuć ją, aby wczytać aktualną kartę."}
      </p>{/if}
    {#if !connected}<p role="status">
        Połącz się ponownie, aby zapisać ten wynik. Wersja robocza jest
        zachowana.
      </p>{/if}
    {#if invalid}<p role="alert">
        Wpisz liczbę całkowitą od 0 do {counterLimit}.
      </p>{/if}
    {#if snapshot.pending && !snapshot.busy}
      <details class="focus-counter-recovery">
        <summary>Szczegóły zapisu</summary>
        <Button disabled={!connected} onclick={oncheck}>Sprawdź wynik</Button>
        <Button onclick={copyCommand}>Kopiuj oczekujące polecenie</Button>
        <pre>{JSON.stringify(snapshot.pending, null, 2)}</pre>
        {#if copied}<p role="status">{copied}</p>{/if}
      </details>
    {/if}
  </section>
{:else if snapshot.notice}
  <p class="focus-counter-saved" role="status">
    <Icon name="check" small />{snapshot.notice}<Button
      variant="quiet"
      aria-label="Zamknij potwierdzenie licznika"
      onclick={oncancel}><Icon name="close" small /></Button
    >
  </p>
{/if}
