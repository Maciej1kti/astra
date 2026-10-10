<script lang="ts">
  import { onMount } from "svelte";
  import type { Summary } from "../../lib/api/api";
  import { command, resourcePath } from "../../lib/api/api";
  import {
    commandOperation,
    sessionAccess,
  } from "../../lib/api/command-operation.svelte";
  import { commandErrorMessage } from "../../lib/api/command-result";
  import CommandRecovery from "../../lib/ui/CommandRecovery.svelte";
  import SessionNotice from "../../lib/ui/SessionNotice.svelte";
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
  const access = sessionAccess();
  const accessLost = $derived(access.lost);
  let error = $state("");
  let info = $state("");
  const operation = commandOperation(() => !access.lost);
  const conflict = $derived(operation.conflict);
  const pending = $derived(operation.pending);
  const busy = $derived(operation.busy);
  function closeWhenResolved() {
    if (!busy && !pending) onclose();
  }

  onMount(() => {
    operation.prepare(
      command(
        resourcePath(item),
        "PATCH",
        { set: { state: nextState } },
        item.version,
      ),
    );
    void transmit();
  });

  async function transmit(action: "submit" | "status" = "submit") {
    if (!pending || busy || accessLost) return;
    error = "";
    info = "";
    try {
      if (action === "status") await operation.confirm();
      else await operation.commit();
      onsaved();
    } catch (cause) {
      error = commandErrorMessage(cause);
    }
  }
  async function copyDraft() {
    info = "";
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ item, state: nextState, pending }, null, 2),
      );
      info = "Skopiowano propozycję.";
    } catch {
      error =
        "Schowek jest niedostępny. Skopiuj propozycję i identyfikator żądania.";
    }
  }
</script>

{#if !error && !accessLost}<p class="project-save-status" role="status">
    Zapisywanie statusu celu…
  </p>{/if}
{#if error || accessLost}
  <dialog
    class="app-dialog dialog-small"
    aria-label="Przenieś cel"
    use:modal={{ onclose: closeWhenResolved }}
    out:layerExit|global
  >
    <DialogHeader
      title="Przenieś cel"
      {onclose}
      disabled={busy || !!pending}
      closeLabel="Zamknij przenoszenie celu"
    />
    <div class="dialog-body">
      <p><strong>{item.title}</strong> → {resourceLabel(nextState)}</p>
      <SessionNotice
        lost={accessLost}
        message="Sesja wygasła. Ta propozycja została zachowana; połącz przeglądarkę ponownie, aby ją dokończyć."
      />
      {#if error}<p role="alert">{error}</p>{/if}
      {#if info}<p role="status">{info}</p>{/if}
      {#if conflict}<p>
          Cel się zmienił. Zamknij tę propozycję i sprawdź aktualny cel przed
          ponownym przeniesieniem.
        </p>{/if}
      <CommandRecovery
        {pending}
        {busy}
        {accessLost}
        oncheck={() => transmit("status")}
        onretry={() => transmit()}
      />
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
