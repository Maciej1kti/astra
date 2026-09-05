<script lang="ts">
  import { untrack } from "svelte";
  import { modal } from "./dialog";
  import {
    api,
    command,
    send,
    ApiError,
    resourcePath,
    type Summary,
    type Pending,
  } from "./api";
  let {
    item,
    status,
    placement,
    neighbors,
    firstPage,
    lastPage,
    onclose,
    onsaved,
  }: {
    item: Summary;
    status: string;
    placement?: { after_id: string | null; before_id: string | null };
    neighbors: Summary[];
    firstPage: boolean;
    lastPage: boolean;
    onclose: () => void;
    onsaved: () => void;
  } = $props();
  let before = $state(untrack(() => placement?.before_id ?? ""));
  let pending = $state<Pending | null>(null),
    busy = $state(false),
    error = $state(""),
    conflict = $state(false);
  async function transmit() {
    if (!pending) return;
    busy = true;
    try {
      const result = await send(pending);
      if (result.state) {
        error = `Command is ${result.state}. Check its status before retrying.`;
        return;
      }
      onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof ApiError && e.status < 500) {
        pending = null;
        conflict = true;
      }
    } finally {
      busy = false;
    }
  }
  async function save() {
    const index = neighbors.findIndex((row) => row.id === before);
    const chosen = before
      ? { before_id: before, after_id: neighbors[index - 1]?.id ?? null }
      : lastPage
        ? { before_id: null, after_id: neighbors.at(-1)?.id ?? null }
        : undefined;
    pending = command(
      resourcePath(item),
      "PATCH",
      { set: { status }, ...(chosen ? { placement: chosen } : {}) },
      item.version,
    );
    await transmit();
  }
  async function check() {
    if (!pending) return;
    busy = true;
    try {
      const result = await api<{ state: string }>(
        `/api/v1/commands/${pending.requestId}`,
      );
      if (result.state === "committed") onsaved();
      else error = `Command state: ${result.state}`;
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  use:modal
  aria-label="Move card"
  oncancel={(event) => {
    event.preventDefault();
    if (!busy && !pending) onclose();
  }}
>
  <h2>Move card</h2>
  <p><strong>{item.title}</strong> → {status}</p>
  <label
    >Position<select
      aria-label="Position"
      bind:value={before}
      disabled={busy || !!pending || conflict}
    >
      <option value="" disabled={!lastPage && status === item.status}
        >End of column</option
      >
      {#each neighbors as neighbor, index}
        <option value={neighbor.id} disabled={index === 0 && !firstPage}
          >Before {neighbor.title}</option
        >
      {/each}
    </select></label
  >
  {#if error}<p role="alert">{error}</p>{/if}{#if conflict}<p>
      The card or its neighbors changed. Close this proposal and review the
      current board.
    </p>{/if}
  {#if pending}<p>Request: {pending.requestId}</p>
    <button onclick={check} disabled={busy}>Check status</button><button
      onclick={transmit}
      disabled={busy}>Retry same command</button
    >{/if}
  <footer>
    <button onclick={onclose} disabled={busy || !!pending}>Cancel</button
    ><button
      onclick={save}
      disabled={busy ||
        !!pending ||
        conflict ||
        (!before && !lastPage && status === item.status)}>Confirm move</button
    >
  </footer>
</dialog>

<style>
  dialog {
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    max-width: calc(100vw - 32px);
    width: 440px;
  }
  dialog::backdrop {
    background: #152d2860;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 24px;
  }
</style>
