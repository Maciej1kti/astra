<script lang="ts">
  import { all, api, type Resource, type Summary } from "./api";
  import Markdown from "./Markdown.svelte";

  let { project, cardId, disabled = false }: { project: string; cardId: string; disabled?: boolean } = $props();
  type UpdateSummary = Summary & { target?: { type: string; id: string } };
  let updates = $state<UpdateSummary[]>([]);
  let loading = $state(false), loaded = $state(false), error = $state("");
  let opened = $state<string | null>(null);
  let records = $state<Record<string, Resource>>({});
  let reading = $state<string | null>(null);

  async function load() {
    if (loading || disabled) return;
    loading = true;
    error = "";
    try {
      const items = await all<UpdateSummary>(`/api/v1/projects/${project}/updates`);
      updates = items.filter((item) => item.target?.type === "card" && item.target.id === cardId)
        .sort((a, b) => (b.recorded_at ?? "").localeCompare(a.recorded_at ?? ""));
      loaded = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }
  async function read(id: string) {
    if (reading || disabled) return;
    if (opened === id) { opened = null; return; }
    opened = id;
    if (records[id]) return;
    reading = id;
    error = "";
    try {
      const record = await api<Resource>(`/api/v1/projects/${project}/updates/${id}`);
      records = { ...records, [id]: record };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      reading = null;
    }
  }
</script>

<details ontoggle={(event) => { if (event.currentTarget.open && !loaded) void load(); }}>
  <summary>Card updates{loaded ? ` · ${updates.length}` : ""}</summary>
  <p class="hint">Results, blockers and decisions recorded for this card.</p>
  {#if loading}<p role="status">Loading card updates…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if loaded && !updates.length}<p class="hint">No updates recorded for this card yet.</p>{/if}
  <ul>
    {#each updates as update (update.id)}
      <li>
        <button type="button" disabled={disabled || !!reading} aria-expanded={opened === update.id} onclick={() => read(update.id)}>{update.title}</button>
        <p class="hint">{(update.kind ?? "note").replaceAll("_", " ")} · <time datetime={update.recorded_at}>{update.recorded_at?.replace("T", " ").replace("Z", " UTC")}</time></p>
        {#if opened === update.id}
          {#if records[update.id]}<Markdown source={records[update.id].body} />
          {:else if reading === update.id}<p role="status">Loading update…</p>{/if}
        {/if}
      </li>
    {/each}
  </ul>
  <button type="button" disabled={disabled || loading} onclick={load}>{loaded ? "Refresh card updates" : "Load card updates"}</button>
</details>

<style>
  details { margin: 20px 0; font-size: 13px; }
  summary { cursor: pointer; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 12px 0; border-bottom: 1px solid var(--line); }
  li > button { width: 100%; text-align: left; overflow-wrap: anywhere; }
  .hint { color: var(--muted); font-size: 12px; line-height: 1.5; }
</style>
