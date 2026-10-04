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
  import type { ProjectState } from "./screens/projects-board";

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
        error =
          "Sesja wygasła. Skopiuj tę propozycję przed ponownym połączeniem.";
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
        "Schowek jest niedostępny. Skopiuj propozycję i identyfikator żądania.";
    }
  }
</script>

{#if !error}<p class="project-save-status" role="status">
    Zapisywanie statusu projektu…
  </p>{/if}
{#if error}
  <dialog
    class="app-dialog dialog-small"
    aria-label="Przenieś projekt"
    use:modal={{ onclose: closeWhenResolved }}
    out:layerExit|global
  >
    <DialogHeader
      title="Przenieś projekt"
      {onclose}
      disabled={busy || !!pending}
      closeLabel="Zamknij przenoszenie projektu"
    />
    <div class="dialog-body">
      <p><strong>{item.title}</strong> → {resourceLabel(nextState)}</p>
      <p role="alert">{error}</p>
      {#if conflict}<p>
          Projekt się zmienił. Zamknij tę propozycję i sprawdź aktualny projekt
          przed ponownym przeniesieniem.
        </p>{/if}
      {#if pending}<p>Żądanie: {pending.requestId}</p>
        <button
          type="button"
          onclick={() => transmit("status")}
          disabled={busy || accessLost}>Sprawdź stan</button
        ><button
          type="button"
          onclick={() => transmit()}
          disabled={busy || accessLost}>Ponów to samo polecenie</button
        >{/if}
      <button type="button" onclick={copyDraft}>Kopiuj wersję roboczą</button>
      {#if accessLost && pending}<details>
          <summary>Zamknij bez rozstrzygnięcia</summary>
          <p>
            Najpierw skopiuj identyfikator żądania i propozycję. Operacja mogła
            już zostać zapisana.
          </p>
          <button type="button" onclick={onclose}>Odrzuć tę propozycję</button>
        </details>{/if}
    </div>
    <footer class="dialog-footer">
      <Button onclick={onclose} disabled={busy || !!pending}>Zamknij</Button>
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
