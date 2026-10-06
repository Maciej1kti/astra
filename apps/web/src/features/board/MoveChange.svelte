<script lang="ts">
  import { resourceLabel } from "../../lib/resources/resource-presentation.ts";
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import CommandRecovery from "../../lib/ui/CommandRecovery.svelte";
  import SessionNotice from "../../lib/ui/SessionNotice.svelte";
  import {
    commandOperation,
    sessionAccess,
  } from "../../lib/api/command-operation.svelte";
  import { commandErrorMessage } from "../../lib/api/command-result";
  import { onMount } from "svelte";
  import { untrack } from "svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { command, resourcePath, type Summary } from "../../lib/api/api";

  const access = sessionAccess();
  const accessLost = $derived(access.lost);
  const operation = commandOperation(() => !access.lost);

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
  let info = $state("");
  const conflict = $derived(operation.conflict);
  function close() {
    if (!busy && !pending) onclose();
  }
  onMount(() => {
    if (autoCommit) void save();
  });
  async function copyDraft() {
    info = "";
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ item, status, before, pending }, null, 2),
      );
      info = "Skopiowano propozycję.";
    } catch {
      error =
        "Schowek jest niedostępny. Zaznacz i skopiuj propozycję oraz identyfikator żądania.";
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
    info = "";
    try {
      if (action === "status") await operation.confirm();
      else await operation.commit();
      onsaved();
    } catch (cause) {
      error = commandErrorMessage(cause);
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
  use:modal={{ onclose: close }}
  out:layerExit|global
  aria-label="Przenieś kartę"
>
  <DialogHeader
    title="Przenieś kartę"
    onclose={close}
    disabled={busy || !!pending}
    closeLabel="Zamknij przenoszenie karty"
  />
  <div class="dialog-body">
    <p><strong>{item.title}</strong> → {resourceLabel(status)}</p>
    <label
      >Pozycja<select
        aria-label="Pozycja"
        bind:value={before}
        disabled={busy || !!pending || conflict}
      >
        <option value="" disabled={!lastPage && status === item.status}
          >Koniec kolumny</option
        >
        {#each neighbors as neighbor, index}
          <option value={neighbor.id} disabled={index === 0 && !firstPage}
            >Przed {neighbor.title}</option
          >
        {/each}
      </select></label
    >
    <SessionNotice
      lost={accessLost}
      message="Sesja wygasła. Ta propozycja została zachowana; połącz przeglądarkę ponownie, aby ją dokończyć."
    />
    {#if error}<p role="alert">{error}</p>{/if}
    {#if info}<p role="status">{info}</p>{/if}{#if conflict}<p>
        Karta lub jej sąsiedzi się zmienili. Zamknij tę propozycję i sprawdź
        aktualną tablicę.
      </p>{/if}
    <CommandRecovery
      {pending}
      {busy}
      {accessLost}
      oncheck={check}
      onretry={transmit}
    />
    {#if error || pending || accessLost}<button
        type="button"
        onclick={copyDraft}>Kopiuj wersję roboczą</button
      >{/if}
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
    <button class="quiet" onclick={close} disabled={busy || !!pending}
      >Anuluj</button
    ><Button
      variant="primary"
      onclick={save}
      disabled={busy ||
        !!pending ||
        conflict ||
        accessLost ||
        (!before && !lastPage && status === item.status)}
      >Potwierdź przeniesienie</Button
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
