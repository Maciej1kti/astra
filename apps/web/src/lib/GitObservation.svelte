<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "./api";
  import { modal } from "./dialog";
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
  let data = $state<Observation | null>(null),
    busy = $state(false),
    error = $state("");
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
        error = e instanceof Error ? e.message : String(e);
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
      error = "Your session ended. Reconnect to inspect Git.";
    };
    window.addEventListener("session-ended", ended);
    return () => {
      generation++;
      window.removeEventListener("session-ended", ended);
    };
  });
</script>

<dialog
  use:modal
  aria-label="Git observation"
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <header>
    <h2>Git observation</h2>
    <button onclick={onclose} aria-label="Close Git observation">✕</button>
  </header>
  <p>
    HEAD and staged index only. Working-tree changes and untracked files are not
    checked.
  </p>
  <button onclick={load} disabled={busy}
    >{busy ? "Checking…" : "Check again"}</button
  >
  {#if error}<p role="alert">{error}</p>{/if}
  {#if data}
    {#if data.stale}<p role="status">Observation unavailable: {data.error}</p>
    {:else}<dl>
        <dt>Branch</dt>
        <dd>{data.branch ?? "Detached HEAD"}</dd>
        <dt>Commit</dt>
        <dd><code>{data.commit ?? "No commits yet"}</code></dd>
        <dt>Staged paths</dt>
        <dd>{data.staged_paths}</dd>
        <dt>Conflicted paths</dt>
        <dd>{data.conflicted_paths}</dd>
      </dl>{/if}
    <small>Checked {data.observed_at}. Counts exclude .project files.</small>
  {/if}
</dialog>

<style>
  dialog {
    width: min(600px, calc(100vw - 24px));
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
  dd,
  code {
    overflow-wrap: anywhere;
  }
  dt {
    margin-top: 12px;
    font-weight: 600;
  }
</style>
