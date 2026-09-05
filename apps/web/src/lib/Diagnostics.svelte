<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "./api";
  import { modal } from "./dialog";
  let { onclose }: { onclose: () => void } = $props();
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
  let data = $state<Diagnostics | null>(null),
    error = $state(""),
    busy = $state(false);
  async function load() {
    busy = true;
    error = "";
    try {
      data = await api<Diagnostics>("/api/v1/diagnostics");
    } catch (e) {
      data = null;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    void load();
    const ended = () => {
      data = null;
      error =
        "Your session ended. Reconnect or run projectctl doctor on the host.";
    };
    window.addEventListener("session-ended", ended);
    return () => window.removeEventListener("session-ended", ended);
  });
</script>

<dialog
  use:modal
  aria-label="Host diagnostics"
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
>
  <header>
    <h2>Host diagnostics</h2>
    <button onclick={onclose} aria-label="Close diagnostics">✕</button>
  </header>
  <button onclick={load} disabled={busy}
    >{busy ? "Checking…" : "Refresh diagnostics"}</button
  >
  {#if error}<p role="alert">{error}</p>{/if}
  {#if data}
    <p>Host: <strong>{data.state}</strong> · Index: {data.index_state}</p>
    <p>
      {data.invalid_documents} source issues · {data.pending_commands} unresolved
      commands
    </p>
    {#each data.warnings as warning}<section class="notice">
        <strong>{warning.code}</strong>
        <p>{warning.message}</p>
      </section>{/each}
    <h3>History</h3>
    <p>
      {data.history.entries} entries · {(data.history.bytes / 1048576).toFixed(
        1,
      )} MiB. Optional history is retained for {data.history.retention_days} days
      or up to {(data.history.byte_budget / 1048576).toFixed(0)} MiB. Pending operations
      and live retry records remain protected.
    </p>
    {#if data.issues.length}<h3>Source issues · first 100</h3>
      {#each data.issues as issue}<p>
          <code>{issue.path}</code><br />{issue.code} · Project {issue.project_id}
        </p>{/each}{/if}
    {#if data.jobs.length}<h3>Unresolved jobs · first 50</h3>
      {#each data.jobs as job}<p>
          <code>{job.id}</code> · {job.state}<br />Project {job.project_id}
        </p>{/each}{/if}
    <small
      >Instance: {data.instance_id ??
        "Unavailable until the workspace is repaired"}</small
    >
  {/if}
</dialog>

<style>
  dialog {
    width: min(680px, calc(100vw - 24px));
    max-height: 90dvh;
    overflow: auto;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  dialog::backdrop {
    background: #152d2860;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  p,
  code {
    overflow-wrap: anywhere;
  }
</style>
