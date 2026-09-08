<script lang="ts">
  import { onDestroy } from "svelte";
  import { api, type Resource, type Summary } from "./api";
  import { cursorPage, cardActivityPath, type Page } from "./pagination";
  import { isAbortError } from "./read-requests";
  import { projectionNotice } from "./projection-state";
  import Markdown from "./Markdown.svelte";

  let {
    project,
    cardId,
    disabled = false,
  }: { project: string; cardId: string; disabled?: boolean } = $props();
  type UpdateSummary = Summary & { target?: { type: string; id: string } };
  let updates = $state<UpdateSummary[]>([]);
  let loading = $state(false),
    loaded = $state(false),
    error = $state("");
  let opened = $state<string | null>(null);
  let records = $state<Record<string, Resource>>({});
  let reading = $state<string | null>(null);
  let refreshRequested = false;
  let cursor = $state<string | null>(null);
  let history = $state<(string | null)[]>([null]);
  let pageNotice = $state("");
  let freshness = $state("");
  let generation = 0;
  let controller: AbortController | undefined;
  onDestroy(() => { generation++; controller?.abort(); });
  $effect(() => {
    if (disabled) {
      generation++; controller?.abort(); loading = false;
      updates = []; records = {}; loaded = false; opened = null;
      cursor = null; history = [null]; refreshRequested = false;
    }
  });

  export async function refresh() {
    if (loading) {
      refreshRequested = true;
      return;
    }
    await load(null, [null]);
  }

  async function load(target: string | null = history.at(-1) ?? null, nextHistory = history) {
    if (loading || disabled) return;
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    loading = true;
    error = "";
    try {
      const result = await cursorPage((page) => api<Page<UpdateSummary>>(cardActivityPath(project, cardId, page), "GET", undefined, {}, { signal }), target);
      if (current !== generation) return;
      updates = result.value.items;
      freshness = projectionNotice(result.value);
      cursor = result.value.page.next_cursor;
      history = result.reset ? [null] : nextHistory;
      pageNotice = result.reset ? "Card activity changed. Showing the first page of the latest updates." : "";
      opened = null;
      records = {};
      loaded = true;
    } catch (cause) {
      if (current === generation && !isAbortError(cause)) error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (current === generation) loading = false;
      if (current === generation && refreshRequested) {
        refreshRequested = false;
        void load(null, [null]);
      }
    }
  }
  async function read(id: string) {
    if (reading || disabled) return;
    if (opened === id) {
      opened = null;
      return;
    }
    opened = id;
    if (records[id]) return;
    reading = id;
    const current = generation;
    error = "";
    try {
      const record = await api<Resource>(
        `/api/v1/projects/${project}/updates/${id}`,
        "GET", undefined, {}, { signal: controller?.signal },
      );
      if (current === generation && !disabled) records = { ...records, [id]: record };
    } catch (cause) {
      if (current === generation && !isAbortError(cause)) error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      reading = null;
    }
  }
</script>

<details
  ontoggle={(event) => {
    if (event.currentTarget.open && !loaded) void load();
  }}
>
  <summary>Card updates{loaded ? ` · ${updates.length} on this page` : ""}</summary>
  <p class="hint">Results, blockers and decisions recorded for this card.</p>
  {#if loading}<p role="status">Loading card updates…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if pageNotice}<p role="status" class="hint">{pageNotice}</p>{/if}
  {#if freshness}<p role="status" class="hint">{freshness}</p>{/if}
  {#if loaded && !updates.length && !freshness}<p class="hint">
      No updates recorded for this card yet.
    </p>{/if}
  <ul>
    {#each updates as update (update.id)}
      <li>
        <button
          type="button"
          disabled={disabled || !!reading}
          aria-expanded={opened === update.id}
          onclick={() => read(update.id)}>{update.title}</button
        >
        <p class="hint">
          {(update.kind ?? "note").replaceAll("_", " ")} ·
          <time datetime={update.recorded_at}
            >{update.recorded_at?.replace("T", " ").replace("Z", " UTC")}</time
          >
        </p>
        {#if opened === update.id}
          {#if records[update.id]}<Markdown source={records[update.id].body} />
          {:else if reading === update.id}<p role="status">
              Loading update…
            </p>{/if}
        {/if}
      </li>
    {/each}
  </ul>
  {#if history.length > 1}<button type="button" disabled={disabled || loading || !!reading} onclick={() => load(history.at(-2) ?? null, history.slice(0, -1))}>Previous updates</button>{/if}
  {#if cursor}<button type="button" disabled={disabled || loading || !!reading} onclick={() => load(cursor, [...history, cursor])}>Next updates</button>{/if}
  <button type="button" disabled={disabled || loading || !!reading} onclick={() => load()}
    >{loaded ? "Refresh card updates" : "Load card updates"}</button
  >
</details>

<style>
  details {
    margin: 20px 0;
    font-size: 13px;
  }
  summary {
    cursor: pointer;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  li > button {
    width: 100%;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
</style>
