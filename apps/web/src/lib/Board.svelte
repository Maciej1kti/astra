<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Summary } from "./api";
  import { dateGesture } from "./date-gesture";
  import type { MoveProposal } from "./proposals";
  let {
    project,
    revision,
    search,
    open,
    onpropose,
  }: {
    project: string;
    revision: number;
    search: string;
    open: (item: Summary) => void;
    onpropose: (proposal: MoveProposal) => void;
  } = $props();
  type Column = {
    status: string;
    items: Summary[];
    total: number;
    page: { next_cursor: string | null };
  };
  let columns = $state<Column[]>([]),
    error = $state(""),
    busy = $state(false);
  let pageStarts = $state<Record<string, boolean>>({});
  let generation = 0,
    deferredRefresh = false;
  onMount(() => {
    const released = () => {
      if (deferredRefresh) {
        deferredRefresh = false;
        void load();
      }
    };
    window.addEventListener("planning-gesture-ended", released);
    return () => window.removeEventListener("planning-gesture-ended", released);
  });
  $effect(() => {
    void project;
    void revision;
    void load();
  });
  async function load(status?: string, cursor?: string | null) {
    const current = ++generation;
    busy = true;
    error = "";
    try {
      const result = await api<{ columns: Column[] }>(
        `/api/v1/views/board?project_id=${project}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (current !== generation) return;
      if (document.querySelector("[data-dragging]")) {
        deferredRefresh = true;
        return;
      }
      if (status) pageStarts[status] = !cursor;
      else
        pageStarts = Object.fromEntries(
          result.columns.map((column) => [column.status, true]),
        );
      columns = status
        ? columns.map((column) =>
            column.status === status
              ? result.columns.find((item) => item.status === status)!
              : column,
          )
        : result.columns;
    } catch (e) {
      error = String(e);
    } finally {
      if (current === generation) busy = false;
    }
  }
  function propose(
    item: Summary,
    status: string,
    placement?: MoveProposal["placement"],
  ) {
    const column = columns.find((column) => column.status === status);
    if (!column) return;
    onpropose({
      item,
      status,
      placement,
      neighbors: column.items.filter((row) => row.id !== item.id),
      firstPage: pageStarts[status] ?? true,
      lastPage: !column.page.next_cursor,
    });
  }
  function gesture(item: Summary) {
    let destination: {
      status: string;
      placement?: { after_id: string | null; before_id: string | null };
    } | null = null;
    return {
      delta: (x: number, y: number) => {
        destination = null;
        if (search.trim()) return 0;
        const nodes = document.elementsFromPoint(x, y);
        const card = nodes.find((node) => node.matches("[data-board-card]")) as
          HTMLElement | undefined;
        const columnNode = nodes.find((node) =>
          node.matches("[data-board-column]"),
        ) as HTMLElement | undefined;
        const status =
          card?.dataset.boardStatus ?? columnNode?.dataset.boardColumn;
        const column = columns.find((column) => column.status === status);
        if (!column) return 0;
        if (card) {
          const target = column.items.find(
            (row) => row.id === card.dataset.boardCard,
          );
          if (!target || target.id === item.id) return 0;
          const rows = column.items.filter((row) => row.id !== item.id);
          const index = rows.findIndex((row) => row.id === target.id);
          const after = rows[index - 1]?.id ?? null;
          // A paginated column may hide the predecessor; do not guess it.
          if (index === 0 && !pageStarts[column.status]) return 0;
          destination = {
            status: column.status,
            placement: { after_id: after, before_id: target.id },
          };
        } else destination = { status: column.status };
        return 1;
      },
      commit: () => {
        if (destination)
          propose(item, destination.status, destination.placement);
      },
    };
  }
</script>

{#if error}<p role="alert">{error}</p>{/if}{#if search}<p>
    Reordering is disabled while filtering. Change status through the card
    editor.
  </p>{/if}
<div class="board date-scroll">
  {#each columns as column}<section
      class="column"
      data-board-column={column.status}
    >
      <header>
        <h2>{column.status}</h2>
        <span>{column.total}</span>
      </header>
      {#each column.items.filter((item) => item.title
          .toLowerCase()
          .includes(search.toLowerCase())) as item}<article
          data-board-card={item.id}
          data-board-status={column.status}
        >
          <button class="title" onclick={() => open(item)}
            ><h3>{item.title}</h3>
            <small>{item.due?.date ?? item.schedule?.start ?? "No date"}</small
            >{#if item.blocked}<span> · Blocked</span>{/if}</button
          >
          <div class="actions">
            <button
              class="handle"
              aria-label={`Reorder: ${item.title}`}
              disabled={!!search || busy}
              use:dateGesture={gesture(item)}>↕</button
            ><label
              ><span class="sr">Move {item.title} to</span><select
                aria-label={`Move ${item.title} to`}
                value=""
                disabled={busy}
                onchange={(event) => {
                  propose(item, event.currentTarget.value);
                  event.currentTarget.value = "";
                }}
                ><option value="" disabled>Move to…</option
                >{#each ["planned", "active", "review", "done", "cancelled"] as status}<option
                    value={status}>{status}</option
                  >{/each}</select
              ></label
            >
          </div>
        </article>{:else}<p>No cards in this page.</p>{/each}
      {#if column.page.next_cursor}<button
          disabled={busy}
          onclick={() => load(column.status, column.page.next_cursor)}
          >Next 50 cards</button
        >{/if}
      {#if column.total > 50}<button
          disabled={busy}
          onclick={() => load(column.status)}>First page</button
        >{/if}
    </section>{/each}
</div>

<style>
  .board {
    display: flex;
    gap: 16px;
    overflow: auto;
    align-items: flex-start;
  }
  .column {
    width: 260px;
    min-width: 260px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
  }
  .column header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .column h2 {
    font-size: 14px;
    text-transform: capitalize;
  }
  .column article {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin: 10px 0;
  }
  .title {
    display: block;
    width: 100%;
    border: 0;
    text-align: left;
    background: none;
  }
  .title h3 {
    font-size: 15px;
    margin: 4px 0 12px;
  }
  .actions {
    display: flex;
    align-items: center;
    padding: 4px;
  }
  .handle {
    touch-action: none;
    min-width: 44px;
    min-height: 44px;
    cursor: grab;
  }
  .handle:global([data-dragging]) {
    z-index: 10;
  }
  .actions select {
    max-width: 155px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
</style>
