<script lang="ts">
  import { serverMessage } from "../../lib/api/messages.ts";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { stateLabel } from "../../lib/resources/state-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { onMount } from "svelte";
  import { api } from "../../lib/api/api";
  import { modal, layerExit } from "../../lib/ui/dialog";

  let {
    onclose,
    foreground = false,
  }: {
    onclose: () => void;
    /** Opened from the pairing layer, which may cover retained dialogs. */
    foreground?: boolean;
  } = $props();
  type Diagnostics = {
    instance_id: string | null;
    state: string;
    index_state: string;
    invalid_documents: number;
    pending_commands: number;
    warnings: { code: string; message: string }[];
    issues: { project_id: string; path: string; code: string }[];
    jobs: { id: string; state: string; project_id: string }[];
    history: {
      entries: number;
      bytes: number;
      retention_days: number;
      byte_budget: number;
    };
  };
  let data = $state<Diagnostics | null>(null);
  let error = $state("");
  let busy = $state(false);
  async function load() {
    busy = true;
    error = "";
    try {
      data = await api<Diagnostics>("/api/v1/diagnostics");
    } catch (e) {
      data = null;
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    void load();
    const ended = () => {
      data = null;
      error =
        "Sesja wygasła. Połącz się ponownie lub uruchom projectctl doctor na serwerze.";
    };
    const unsubscribeSession = subscribeSession({ ended: ended });
    return () => unsubscribeSession();
  });
</script>

<dialog
  class="app-dialog"
  use:modal={{ onclose, foreground }}
  out:layerExit|global
  aria-label="Diagnostyka serwera"
>
  <DialogHeader
    title="Diagnostyka serwera"
    {onclose}
    closeLabel="Zamknij diagnostykę"
  />
  <div class="dialog-body">
    <button onclick={load} disabled={busy}
      >{busy ? "Sprawdzanie…" : "Odśwież diagnostykę"}</button
    >
    {#if error}<p role="alert">{error}</p>{/if}
    {#if data}
      <p>
        Serwer: <strong>{stateLabel(data.state)}</strong> · Indeks: {stateLabel(
          data.index_state,
        )}
      </p>
      <p>
        {data.invalid_documents} problemów ze źródłami · {data.pending_commands} nierozstrzygniętych
        poleceń
      </p>
      {#each data.warnings as warning}<section class="notice">
          <strong>{warning.code}</strong>
          <p>{serverMessage(warning.code)}</p>
        </section>{/each}
      <h3>Historia</h3>
      <p>
        {data.history.entries} wpisów · {(data.history.bytes / 1048576).toFixed(
          1,
        )} MiB. Opcjonalna historia jest zachowywana przez {data.history
          .retention_days} dni lub do {(
          data.history.byte_budget / 1048576
        ).toFixed(0)} MiB. Oczekujące operacje i aktywne zapisy ponowień pozostają
        chronione.
      </p>
      {#if data.issues.length}<h3>Problemy ze źródłami · pierwsze 100</h3>
        {#each data.issues as issue}<p>
            <code>{issue.path}</code><br />{issue.code} · Projekt {issue.project_id}
          </p>{/each}{/if}
      {#if data.jobs.length}<h3>Nierozstrzygnięte zadania · pierwsze 50</h3>
        {#each data.jobs as job}<p>
            <code>{job.id}</code> · {stateLabel(job.state)}<br />Projekt {job.project_id}
          </p>{/each}{/if}
      <small
        >Instancja: {data.instance_id ??
          "Niedostępne do czasu naprawy przestrzeni roboczej"}</small
      >
    {/if}
  </div>
</dialog>

<style>
  h3 {
    font-size: var(--text-lg);
    margin-top: var(--space-10);
  }
  small {
    color: var(--muted);
    font-size: var(--text-sm);
  }
</style>
