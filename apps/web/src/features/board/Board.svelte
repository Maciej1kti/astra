<script lang="ts">
  import Icon from "../../lib/ui/Icon.svelte";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import { onMount, onDestroy, untrack } from "svelte";
  import { cursorPage } from "../../lib/api/pagination";
  import {
    projectionNotice,
    type ProjectionState,
  } from "../../lib/api/projection-state";
  import { api, type Summary } from "../../lib/api/api";
  import KanbanBoard from "./KanbanBoard.svelte";
  import type { KanbanColumn } from "./board-context";
  import type { MoveProposal } from "../planning/proposals";
  import { PlanningRead } from "../planning/planning-read";

  let {
    project,
    revision,
    search,
    open,
    onpropose,
    oncreate,
    ondraftchange,
  }: {
    project: string;
    revision: number;
    search: string;
    open: (item: Summary) => void;
    ondraftchange?: (dirty: boolean) => void;
    onpropose: (proposal: MoveProposal) => void;
    oncreate: (
      type: "card",
      initial: Partial<import("../../lib/contracts/api.generated").CardCreate>,
      autoCreate?: boolean,
    ) => void;
  } = $props();
  type Column =
    import("../../lib/contracts/api.generated").BoardView["columns"][number];
  // Pages are replaced as a whole and never edited in place.
  let columns = $state.raw<Column[]>([]);
  const readScope = $derived(`${project}:${revision}`);
  let error = $state("");
  let busy = $state(false);
  const pageStarts = $state<Record<string, boolean>>({});
  let kanban = $state<ReturnType<typeof KanbanBoard>>();
  let initialView = true;
  let quickStatus = $state<string | null>(null);
  const quickTitles = $state<Record<string, string>>({});
  $effect(() => {
    ondraftchange?.(Object.values(quickTitles).some((title) => !!title));
  });
  onDestroy(() => ondraftchange?.(false));
  function focusTitle(node: HTMLInputElement) {
    node.focus();
  }
  function quickCreate(status: Column["status"]) {
    const title = (quickTitles[status] ?? "").trim();
    if (!title || title.length > 240 || busy || gestureActive) return;
    oncreate("card", { title, status }, true);
    quickTitles[status] = "";
  }
  const columnCursors: Record<string, string | null> = {};
  let freshness = $state("");
  let pageNotice = $state("");
  // Identifies the read whose scroll restoration may still be applied.
  let generation = 0;
  let gestureActive = $state(false);
  const reads = new PlanningRead((value) => {
    busy = value;
  });
  onMount(() => {
    const started = () => {
      gestureActive = true;
      reads.pause(true);
    };
    const released = () => {
      gestureActive = false;
      reads.pause(false);
    };
    window.addEventListener("planning-gesture-started", started);
    window.addEventListener("planning-gesture-ended", released);
    return () => {
      generation++;
      reads.dispose();
      window.removeEventListener("planning-gesture-started", started);
      window.removeEventListener("planning-gesture-ended", released);
    };
  });
  $effect(() => {
    void readScope;
    untrack(() => void load());
  });
  async function load(status?: string, cursor?: string | null) {
    // One column page is a single request. Its controls are disabled during
    // reads and gestures, so whatever is deferred or repeated is a refresh.
    let requested =
      status && !gestureActive ? { status, cursor: cursor ?? null } : undefined;
    let current = 0;
    await reads.run({
      key: "board",
      read: async (signal) => {
        current = ++generation;
        error = "";
        const selected = requested;
        requested = undefined;
        const requests = selected
          ? [selected]
          : columns.length
            ? columns.map((column) => ({
                status: column.status,
                cursor: columnCursors[column.status] ?? null,
              }))
            : [{ status: undefined, cursor: null }];
        const pages = await Promise.all(
          requests.map(async (request) => ({
            ...request,
            ...(await cursorPage(
              (page) =>
                api<{ columns: Column[] } & ProjectionState>(
                  `/api/v1/views/board?project_id=${project}&limit=50${page ? `&cursor=${encodeURIComponent(page)}` : ""}`,
                  "GET",
                  undefined,
                  {},
                  { signal },
                ),
              request.cursor,
            )),
          })),
        );
        return { status: selected?.status, pages };
      },
      apply: async ({ status, pages }) => {
        // A drag that has not announced itself yet still holds its baseline.
        if (document.querySelector("[data-dragging]")) {
          void load();
          return;
        }
        const restore = initialView || !!status;
        kanban?.holdView(restore);
        const resolved = new Map<string, Column>();
        for (const page of pages) {
          for (const column of page.value.columns) {
            if (page.status && page.status !== column.status) continue;
            resolved.set(column.status, column);
            columnCursors[column.status] = page.reset ? null : page.cursor;
            pageStarts[column.status] = !columnCursors[column.status];
          }
        }
        freshness = [
          ...new Set(
            pages.map((page) => projectionNotice(page.value)).filter(Boolean),
          ),
        ].join(" ");
        pageNotice = pages.some((page) => page.reset)
          ? "Tablica się zmieniła. Wyświetlono pierwszą stronę aktualnych kolumn."
          : "";
        if (status) {
          columns = columns.map(
            (column) => resolved.get(column.status) ?? column,
          );
        } else columns = [...resolved.values()];
        if (restore) await kanban?.restoreView(() => current === generation);
        if (current === generation) initialView = false;
      },
      failed: (cause) => {
        error = errorMessage(cause);
        kanban?.release();
      },
    });
  }
  function propose(
    item: Summary,
    status: string,
    placement?: MoveProposal["placement"],
    autoCommit = false,
    onsettled?: (saved: boolean) => void,
  ) {
    const column = columns.find((column) => column.status === status);
    if (!column) return onsettled?.(false);
    onpropose({
      item,
      status,
      placement,
      neighbors: column.items.filter((row) => row.id !== item.id),
      firstPage: pageStarts[status] ?? true,
      lastPage: !column.page.next_cursor,
      autoCommit,
      onsettled,
    });
  }
  const kanbanColumns = $derived<KanbanColumn[]>(
    columns.map((column) => ({
      id: column.status,
      label: resourceLabel(column.status),
      total: column.total,
      items: column.items,
      firstPage: pageStarts[column.status] ?? false,
      lastPage: !column.page.next_cursor,
    })),
  );
  const matching = $derived(
    columns.some((column) =>
      column.items.some((item) =>
        item.title.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    ),
  );
  const nextCursor = (status: string) =>
    columns.find((column) => column.status === status)?.page.next_cursor;
</script>

{#if freshness}<p role="status" class="notice">{freshness}</p>{/if}
{#if pageNotice}<p role="status" class="hint">{pageNotice}</p>{/if}
{#if error}<p>
    <span role="alert">{error}</span>
    <button disabled={busy || gestureActive} onclick={() => load()}
      >Wczytaj tablicę ponownie</button
    >
  </p>{/if}
{#if busy && !columns.length}<p role="status">Ładowanie tablicy…</p>{/if}
{#if search.trim()}<p>
    Filtr obejmuje tylko wczytane strony. Zmiana kolejności jest wyłączona
    podczas filtrowania.
    {#if !busy && !matching}Brak pasujących kart na wczytanych stronach.{/if}
  </p>{/if}
<KanbanBoard
  bind:this={kanban}
  viewKey={project}
  columns={kanbanColumns}
  filter={search}
  {busy}
  ready={!busy && !!columns.length}
  {open}
  onmove={(item, column, placement, settle) =>
    propose(item, column.id, placement, true, settle)}
>
  {#snippet footer(column)}
    {#if quickStatus === column.id}
      <form
        class="quick-add"
        onsubmit={(event) => {
          event.preventDefault();
          quickCreate(column.id as Column["status"]);
        }}
      >
        <input
          aria-label={`Tytuł nowej karty w ${column.label}`}
          placeholder="Tytuł karty…"
          maxlength="240"
          required
          bind:value={quickTitles[column.id]}
          use:focusTitle
          onkeydown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              quickStatus = null;
            }
          }}
        />
        <div class="pagination">
          <button
            type="submit"
            disabled={busy ||
              gestureActive ||
              !(quickTitles[column.id] ?? "").trim()}>Dodaj</button
          >
          <button type="button" onclick={() => (quickStatus = null)}
            >Zamknij</button
          >
        </div>
      </form>
    {:else}
      <button
        class="add-card"
        aria-label={`Dodaj kartę w ${column.label}`}
        disabled={busy || gestureActive}
        onclick={() => {
          if (!(column.id in quickTitles)) quickTitles[column.id] = "";
          quickStatus = column.id;
        }}><Icon name="plus" small /> Dodaj kartę</button
      >
    {/if}
    {#if column.total > 50}
      <small>{column.items.length} z {column.total} wczytano</small>
      <div class="pagination">
        {#if !column.lastPage}<button
            aria-label={`Następne 50 w ${column.label}`}
            disabled={busy || gestureActive}
            onclick={() => load(column.id, nextCursor(column.id))}
            >Następne 50</button
          >{/if}
        <button
          aria-label={`Pierwsza strona w ${column.label}`}
          disabled={busy || gestureActive || column.firstPage}
          onclick={() => load(column.id)}>Pierwsza strona</button
        >
      </div>
    {/if}
  {/snippet}
</KanbanBoard>

<style>
  .quick-add {
    display: grid;
    gap: var(--space-3);
  }
  .quick-add input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .add-card {
    text-align: left;
    border: 0;
    background: transparent;
    color: var(--muted);
  }
  .add-card:hover {
    background: var(--hover);
  }
  .pagination {
    display: flex;
    gap: var(--space-3);
  }
  .pagination button {
    flex: 1;
    padding: var(--space-3);
    font-size: var(--text-base);
  }
</style>
