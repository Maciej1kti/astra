<script lang="ts">
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { onMount } from "svelte";
  import { untrack } from "svelte";
  import { modal } from "../../lib/ui/dialog";
  import { command, resourcePath, type Summary } from "../../lib/api/api";

  const operation = commandOperation(() => !accessLost);

  let {
    item,
    status,
    placement,
    neighbors,
    firstPage,
    lastPage,
    autoCommit = false,
    onclose,
    onsaved,
  }: {
    item: Summary;
    status: string;
    placement?: { after_id: string | null; before_id: string | null };
    neighbors: Summary[];
    firstPage: boolean;
    lastPage: boolean;
    autoCommit?: boolean;
    onclose: () => void;
    onsaved: () => void;
  } = $props();
  let before = $state(untrack(() => placement?.before_id ?? ""));
  let pending = $derived(operation.pending);
  let busy = $derived(operation.busy);
  let error = $state("");
  let conflict = $state(false);
  let accessLost = $state(false);
  onMount(() => {
    const lost = () => {
      accessLost = true;
      error =
        "Your session ended. Copy this proposal before closing and reconnecting.";
    };
    const restored = () => {
      accessLost = false;
    };
    const unsubscribeSession = subscribeSession({
      ended: lost,
      restored: restored,
    });

    if (autoCommit) void save();
    return () => {
      unsubscribeSession();
    };
  });
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ item, status, before, pending }, null, 2),
      );
      error = "Proposal copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy the proposal and request ID.";
    }
  }
  async function transmit() {
    if (!pending || accessLost || busy) return;
    error = "";
    try {
      await operation.commit();
      onsaved();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      conflict = operation.phase === "rejected";
    }
  }
  async function save() {
    if (accessLost) return;
    const index = neighbors.findIndex((row) => row.id === before);
    const chosen = before
      ? { before_id: before, after_id: neighbors[index - 1]?.id ?? null }
      : lastPage
        ? { before_id: null, after_id: neighbors.at(-1)?.id ?? null }
        : undefined;
    operation.prepare(
      command(
        resourcePath(item),
        "PATCH",
        { set: { status }, ...(chosen ? { placement: chosen } : {}) },
        item.version,
      ),
    );
    await transmit();
  }
  async function check() {
    if (!pending || accessLost || busy) return;
    try {
      await operation.confirm();
      onsaved();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
</script>

<dialog
  class="app-dialog"
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
  <button type="button" onclick={copyDraft}>Copy draft</button>
  {#if accessLost && pending}<details>
      <summary>Close without resolving</summary>
      <p>
        Copy the request ID and proposal first. The operation may already have
        committed.
      </p>
      <button type="button" onclick={onclose}>Discard this proposal</button>
    </details>{/if}
  <footer>
    <button onclick={onclose} disabled={busy || !!pending}>Cancel</button
    ><button
      onclick={save}
      disabled={busy ||
        !!pending ||
        conflict ||
        accessLost ||
        (!before && !lastPage && status === item.status)}>Confirm move</button
    >
  </footer>
</dialog>

<style>
  dialog {
    max-width: calc(100vw - 32px);
    width: 440px;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 24px;
  }
</style>
