<script lang="ts">
  import { onMount, setContext } from "svelte";
  import { api, type Summary } from "./api";
  import {
    Kanban,
    Willow,
    type KanbanInstanceApi,
  } from "@svar-ui/svelte-kanban";
  import BoardCard from "./BoardCard.svelte";
  import { BOARD_CONTEXT, type BoardContext } from "./board-context";
  import type { MoveProposal } from "./proposals";
  let {
    project,
    revision,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    revision: number;
    search: string;
    open: (item: Summary) => void;
    onpropose: (proposal: MoveProposal) => void;
    oncreate: (type: string, initial: Record<string, unknown>) => void;
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
  let gestureActive = $state(false);
  onMount(() => {
    const started = () => {
      gestureActive = true;
    };
    const released = () => {
      gestureActive = false;
      if (deferredRefresh) {
        deferredRefresh = false;
        void load();
      }
    };
    window.addEventListener("planning-gesture-started", started);
    window.addEventListener("planning-gesture-ended", released);
    return () => {
      generation++;
      window.removeEventListener("planning-gesture-started", started);
      window.removeEventListener("planning-gesture-ended", released);
    };
  });
  $effect(() => {
    void project;
    void revision;
    void load();
  });
  async function load(status?: string, cursor?: string | null) {
    if (gestureActive) {
      deferredRefresh = true;
      return;
    }
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
          node.matches("[data-kanban-column-cards]"),
        ) as HTMLElement | undefined;
        const status =
          card?.dataset.boardStatus ??
          columnNode?.dataset.kanbanColumnCards?.replace(/^:/, "");
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

  const collapsed = new Map<string, boolean>();
  const boardColumns = $derived(
    columns.map((column) => ({
      id: column.status,
      label: `${column.status} · ${column.total}`,
      cardLimit: false,
      collapsed: collapsed.get(column.status) ?? false,
      css: `astra-column-${column.status}`,
    })),
  );
  const boardCards = $derived(
    columns.flatMap((column) =>
      column.items
        .filter((item) =>
          item.title.toLowerCase().includes(search.toLowerCase()),
        )
        .map((item) => ({
          id: item.id,
          column: column.status,
          label: item.title,
          astra: item,
        })),
    ),
  );
  setContext<BoardContext>(BOARD_CONTEXT, {
    open: (item) => open(item),
    propose,
    gesture,
    disabled: () => !!search.trim() || (busy && !gestureActive),
    busy: () => busy,
    update: (item) =>
      oncreate("update", { target: { type: "card", id: item.id } }),
  });
  function scrolling(node: HTMLElement) {
    node.querySelector(".wx-scroll")?.classList.add("date-scroll");
  }
  function initialize(store: KanbanInstanceApi) {
    // SVAR is a view adapter. It never commits or optimistically changes cards.
    store.intercept("add-card", (event) => {
      if ("card" in event && event.card && "column" in event.card)
        oncreate("card", { status: String(event.card.column) });
      return false;
    });
    for (const action of [
      "move-card",
      "delete-card",
      "update-card",
      "select-card",
    ] as const)
      store.intercept(action, () => false);
    store.on("update-column", (event) => {
      if (
        "id" in event &&
        "column" in event &&
        event.column &&
        typeof event.column === "object" &&
        "collapsed" in event.column
      )
        collapsed.set(String(event.id), Boolean(event.column.collapsed));
    });
  }
</script>

{#if error}<p role="alert">{error}</p>{/if}
{#if search}<p>
    Filtering searches the loaded pages only. Reordering is disabled while
    filtering.
  </p>{/if}
<div class="astra-board" use:scrolling>
  <Willow fonts={false}>
    <Kanban
      cards={boardCards}
      columns={boardColumns}
      cardContent={BoardCard}
      card={{ menu: false }}
      init={initialize}
      render={{ fixedColumnWidth: true, virtualizeCards: false }}
    />
  </Willow>
</div>
<div class="pages">
  {#each columns.filter((column) => column.total > 50) as column}
    <div>
      <span>{column.status}: {column.items.length} loaded / {column.total}</span
      >
      {#if column.page.next_cursor}<button
          disabled={busy || gestureActive}
          onclick={() => load(column.status, column.page.next_cursor)}
          >Next 50 in {column.status}</button
        >{/if}
      <button
        disabled={busy || gestureActive || pageStarts[column.status]}
        onclick={() => load(column.status)}
        >First page in {column.status}</button
      >
    </div>
  {/each}
</div>

<style>
  .astra-board {
    min-width: 0;
    height: clamp(360px, 68vh, 900px);
  }
  .astra-board :global(.wx-willow-theme) {
    --wx-font-family: inherit;
    --wx-color-font: var(--ink);
    --wx-color-font-alt: var(--ink);
    --wx-background: var(--paper);
    --wx-background-alt: var(--paper);
    --wx-background-hover: var(--hover);
    --wx-kanban-bg: transparent;
    --wx-kanban-column-bg: var(--paper);
    --wx-kanban-card-bg: var(--paper);
    --wx-kanban-border-color: var(--line);
  }
  .astra-board :global(.wx-column) {
    border: 1px solid var(--line);
  }
  .astra-board :global(.wx-column-header) {
    padding: 4px;
    gap: 2px;
  }
  .astra-board :global(.wx-column-header button) {
    min-width: 40px;
    min-height: 42px;
  }
  .astra-board :global(.wx-title) {
    text-transform: capitalize;
    font-size: 14px;
  }
  .astra-board :global(.wx-card) {
    touch-action: pan-y;
    padding: 0;
    border-top: 0;
  }
  .astra-board :global(.wx-icon::before) {
    font-family: sans-serif;
    font-style: normal;
  }
  .astra-board :global(.wxi-plus::before) {
    content: "+";
  }
  .astra-board :global(.wxi-angle-left::before) {
    content: "‹";
  }
  .astra-board :global(.wxi-angle-right::before) {
    content: "›";
  }
  .pages {
    margin-top: 12px;
    display: grid;
    gap: 8px;
  }
  .pages > div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
</style>
