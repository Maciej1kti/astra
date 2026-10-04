<script lang="ts">
  import { onMount } from "svelte";
  import type { Summary } from "../../lib/api/api";
  import { command, resourcePath } from "../../lib/api/api";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import {
    commandErrorMessage,
    isRejectedConflict,
  } from "../../lib/api/command-result";
  import { subscribeSession } from "../../lib/api/session-events";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import type { MainProjectState as ProjectState } from "./screens/main-projects";

  let {
    item,
    state: nextState,
    onclose,
    onsaved,
  }: {
    item: Summary;
    state: ProjectState;
    onclose: () => void;
    onsaved: () => void;
  } = $props();
  let accessLost = $state(false);
  let error = $state("");
  let conflict = $state(false);
  const operation = commandOperation(() => !accessLost);
  const pending = $derived(operation.pending);
  const busy = $derived(operation.busy);
  function closeWhenResolved() {
    if (!busy && !pending) onclose();
  }

  onMount(() => {
    const unsubscribe = subscribeSession({
      ended: () => {
        accessLost = true;
        error = "Your session ended. Copy this proposal before reconnecting.";
      },
      restored: () => {
        accessLost = false;
      },
    });
    operation.prepare(
      command(
        resourcePath(item),
        "PATCH",
        { set: { state: nextState } },
        item.version,
      ),
    );
    void transmit();
    return unsubscribe;
  });

  async function transmit(action: "submit" | "status" = "submit") {
    if (!pending || busy || accessLost) return;
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
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ item, state: nextState, pending }, null, 2),
      );
    } catch {
      error =
        "Clipboard access is unavailable. Copy the proposal and request ID.";
    }
  }
</script>

{#if !error}<p class="project-save-status" role="status">
    Saving project status…
  </p>{/if}
{#if error}
  <dialog
    class="app-dialog dialog-small"
    aria-label="Move project"
    use:modal={{ onclose: closeWhenResolved }}
    out:layerExit|global
  >
    <DialogHeader
      title="Move project"
      {onclose}
      disabled={busy || !!pending}
      closeLabel="Close move project"
    />
    <div class="dialog-body">
      <p><strong>{item.title}</strong> → {resourceLabel(nextState)}</p>
      <p role="alert">{error}</p>
      {#if conflict}<p>
          The project changed. Close this proposal and review the current
          project before moving it again.
        </p>{/if}
      {#if pending}<p>Request: {pending.requestId}</p>
        <button
          type="button"
          onclick={() => transmit("status")}
          disabled={busy || accessLost}>Check status</button
        ><button
          type="button"
          onclick={() => transmit()}
          disabled={busy || accessLost}>Retry same command</button
        >{/if}
      <button type="button" onclick={copyDraft}>Copy draft</button>
      {#if accessLost && pending}<details>
          <summary>Close without resolving</summary>
          <p>
            Copy the request ID and proposal first. The operation may already
            have committed.
          </p>
          <button type="button" onclick={onclose}>Discard this proposal</button>
        </details>{/if}
    </div>
    <footer class="dialog-footer">
      <Button onclick={onclose} disabled={busy || !!pending}>Close</Button>
    </footer>
  </dialog>
{/if}

<style>
  .project-save-status {
    position: fixed;
    inset: auto var(--space-10) var(--space-10) auto;
    z-index: var(--layer-floating);
    padding: var(--space-4) var(--space-6);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--paper);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
  }
</style>
