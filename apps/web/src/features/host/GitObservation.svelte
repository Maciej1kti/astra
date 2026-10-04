<script lang="ts">
  import { serverMessage } from "../../lib/api/messages";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { formatTimestamp } from "../../lib/resources/resource-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { onMount } from "svelte";
  import { api } from "../../lib/api/api";
  import { modal, layerExit } from "../../lib/ui/dialog";

  let { project, onclose }: { project: string; onclose: () => void } = $props();
  type Observation = {
    branch: string | null;
    commit: string | null;
    observed_at: string;
    stale: boolean;
    error: string | null;
    staged_paths: number | null;
    conflicted_paths: number | null;
  };
  let data = $state<Observation | null>(null);
  let busy = $state(false);
  let error = $state("");
  let generation = 0;
  async function load() {
    const current = ++generation;
    busy = true;
    error = "";
    try {
      const result = await api<Observation>(`/api/v1/projects/${project}/git`);
      if (current === generation) data = result;
    } catch (e) {
      if (current === generation) {
        data = null;
        error = errorMessage(e);
      }
    } finally {
      if (current === generation) busy = false;
    }
  }
  onMount(() => {
    void load();
    const ended = () => {
      generation++;
      data = null;
      busy = false;
      error = "Sesja wygasła. Połącz się ponownie, aby sprawdzić Git.";
    };
    const unsubscribeSession = subscribeSession({ ended: ended });
    return () => {
      generation++;
      unsubscribeSession();
    };
  });
</script>

<dialog
  class="app-dialog"
  use:modal={{ onclose }}
  out:layerExit|global
  aria-label="Stan repozytorium Git"
>
  <DialogHeader
    title="Stan repozytorium Git"
    {onclose}
    closeLabel="Zamknij stan Git"
  />
  <div class="dialog-body">
    <p>
      Tylko HEAD i pliki przygotowane do commita. Zmiany w katalogu roboczym i
      nieśledzone pliki nie są sprawdzane.
    </p>
    <button onclick={load} disabled={busy}
      >{busy ? "Sprawdzanie…" : "Sprawdź ponownie"}</button
    >
    {#if error}<p role="alert">{error}</p>{/if}
    {#if data}
      {#if data.stale}<p role="status">
          Stan niedostępny: {serverMessage(data.error ?? "GIT_UNAVAILABLE")}
        </p>
      {:else}<dl>
          <dt>Gałąź</dt>
          <dd>{data.branch ?? "Odłączony HEAD"}</dd>
          <dt>Commit</dt>
          <dd><code>{data.commit ?? "Brak commitów"}</code></dd>
          <dt>Przygotowane ścieżki</dt>
          <dd>{data.staged_paths}</dd>
          <dt>Ścieżki z konfliktami</dt>
          <dd>{data.conflicted_paths}</dd>
        </dl>{/if}
      <small
        >Sprawdzono {formatTimestamp(data.observed_at)}. Liczby nie obejmują
        plików .project.</small
      >
    {/if}
  </div>
</dialog>

<style>
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-6);
    padding: var(--space-8);
    background: var(--soft);
    border-radius: var(--radius-control);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  dt,
  small {
    color: var(--muted);
    font-size: var(--text-label);
  }
</style>
