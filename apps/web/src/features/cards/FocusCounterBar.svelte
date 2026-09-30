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
      copied = "Command copied";
    } catch {
      copied = "Could not copy. Select the command details below.";
    }
  }
</script>

{#if snapshot.draft}
  {@const draft = snapshot.draft}
  <section
    class="focus-counter-bar"
    aria-label="Edit focus counter"
    data-focus-interactive
  >
    <div class="focus-counter-bar-heading">
      <strong>{draft.counter.name}</strong>
      <span title={draft.title}>{draft.title}</span>
      <small
        >{draft.counter.date === today ? "Today" : draft.counter.date} · {draft
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
        aria-label={`${draft.counter.name} total`}
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
          >{snapshot.busy ? "Saving…" : "Retry same command"}</Button
        >
      {:else if snapshot.rejected}
        <Button onclick={oncancel}>Discard and refresh</Button>
      {:else}
        <Button
          variant="quiet"
          aria-label="Cancel counter edit"
          onclick={oncancel}><Icon name="close" small /></Button
        >
        <Button
          variant="primary"
          disabled={invalid ||
            !connected ||
            draft.value === draft.counter.value}
          onclick={onsave}><Icon name="check" small />Save</Button
        >
      {/if}
    </div>
    {#if snapshot.error}<p role="alert">
        {snapshot.error}
        {snapshot.pending
          ? "Your original command is retained."
          : "Your value is kept above. Discard it to load the current card."}
      </p>{/if}
    {#if !connected}<p role="status">
        Reconnect to save this result. Your draft is kept here.
      </p>{/if}
    {#if invalid}<p role="alert">
        Enter a whole number from 0 to {counterLimit}.
      </p>{/if}
    {#if snapshot.pending && !snapshot.busy}
      <details class="focus-counter-recovery">
        <summary>Save details</summary>
        <Button disabled={!connected} onclick={oncheck}>Check result</Button>
        <Button onclick={copyCommand}>Copy pending command</Button>
        <pre>{JSON.stringify(snapshot.pending, null, 2)}</pre>
        {#if copied}<p role="status">{copied}</p>{/if}
      </details>
    {/if}
  </section>
{:else if snapshot.notice}
  <p class="focus-counter-saved" role="status">
    <Icon name="check" small />{snapshot.notice}<Button
      variant="quiet"
      aria-label="Dismiss counter confirmation"
      onclick={oncancel}><Icon name="close" small /></Button
    >
  </p>
{/if}
