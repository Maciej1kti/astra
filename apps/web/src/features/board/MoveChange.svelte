<script lang="ts">
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import {
    commandErrorMessage,
    isRejectedConflict,
  } from "../../lib/api/command-result";
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
    await runCommand("submit");
  }
  async function check() {
    await runCommand("status");
  }
  async function runCommand(action: "submit" | "status") {
    if (!pending || accessLost || busy) return;
    error = "";
    try {
      if (action === "status") await operation.confirm();
      else await operation.commit();
      onsaved();
    } catch (cause) {
      error = commandErrorMessage(cause);
      conflict = isRejectedConflict(operation.phase, cause);
    }
  }
  async function save() {
    if (accessLost || busy || pending || conflict) return;
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
</script>

<dialog
  class="app-dialog dialog-small"
  use:modal
  aria-label="Move card"
  oncancel={(event) => {
    event.preventDefault();
    if (!busy && !pending) onclose();
  }}
>
  <DialogHeader
    title="Move card"
    {onclose}
    disabled={busy || !!pending}
    closeLabel="Close move card"
  />
  <div class="dialog-body">
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
    {#if error || pending || accessLost}<button
        type="button"
        onclick={copyDraft}>Copy draft</button
      >{/if}
    {#if accessLost && pending}<details>
        <summary>Close without resolving</summary>
        <p>
          Copy the request ID and proposal first. The operation may already have
          committed.
        </p>
        <button type="button" onclick={onclose}>Discard this proposal</button>
      </details>{/if}
  </div>
  <footer class="dialog-footer">
    <button onclick={onclose} disabled={busy || !!pending}>Cancel</button
    ><Button
      variant="primary"
      onclick={save}
      disabled={busy ||
        !!pending ||
        conflict ||
        accessLost ||
        (!before && !lastPage && status === item.status)}>Confirm move</Button
    >
  </footer>
</dialog>

<style>
  label {
    display: grid;
    gap: var(--space-4);
    margin: var(--space-8) 0;
  }
</style>
