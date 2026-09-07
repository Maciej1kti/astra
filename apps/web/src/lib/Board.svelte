<script lang="ts">
  import { onMount, setContext, untrack, tick } from "svelte";
  import { on } from "svelte/events";
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
    untrack(() => void load());
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
      if (gestureActive || document.querySelector("[data-dragging]")) {
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
    autoCommit = false,
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
      autoCommit,
    });
  }
  function gesture(item: Summary) {
    let destination: {
      status: string;
      placement?: { after_id: string | null; before_id: string | null };
    } | null = null;
    return {
      disabled: () => !!search.trim() || busy,
      target: (x: number, y: number) => {
        destination = null;
        if (search.trim()) return null;
        const columnNode = document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>("[data-kanban-column-cards]");
        const status = columnNode?.dataset.kanbanColumnCards?.replace(/^:/, "");
        const column = columns.find((column) => column.status === status);
        if (!column || !columnNode) return null;
        const rows = column.items.filter((row) => row.id !== item.id);
        const cards = [
          ...columnNode.querySelectorAll<HTMLElement>("[data-board-card]"),
        ].filter((node) => node.dataset.boardCard !== item.id);
        const next = cards.find((node) => {
          const rect = node.getBoundingClientRect();
          return y < rect.top + rect.height / 2;
        });
        const index = next
          ? rows.findIndex((row) => row.id === next.dataset.boardCard)
          : rows.length;
        if (
          index < 0 ||
          (index === 0 && !pageStarts[column.status]) ||
          (index === rows.length && column.page.next_cursor)
        )
          return null;
        const placement = {
          after_id: rows[index - 1]?.id ?? null,
          before_id: rows[index]?.id ?? null,
        };
        const currentIndex = column.items.findIndex(
          (row) => row.id === item.id,
        );
        if (
          column.status === item.status &&
          placement.after_id === (column.items[currentIndex - 1]?.id ?? null) &&
          placement.before_id === (column.items[currentIndex + 1]?.id ?? null)
        )
          return null;
        destination = { status: column.status, placement };
        const rect = columnNode.getBoundingClientRect();
        const edge =
          next?.getBoundingClientRect().top ??
          cards.at(-1)?.getBoundingClientRect().bottom ??
          rect.top + 12;
        return {
          left: rect.left + 8,
          top: Math.max(rect.top + 3, Math.min(rect.bottom - 3, edge)),
          width: rect.width - 16,
          label: column.status,
        };
      },
      commit: () => {
        if (destination)
          propose(item, destination.status, destination.placement, true);
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
    reorder: (item, direction) => {
      if (busy || search.trim()) return;
      const column = columns.find((column) => column.status === item.status);
      if (!column) return;
      const index = column.items.findIndex((row) => row.id === item.id);
      const rows = column.items.filter((row) => row.id !== item.id);
      const destination = index + direction;
      if (
        index < 0 ||
        destination < 0 ||
        destination > rows.length ||
        (destination === 0 && !pageStarts[column.status]) ||
        (destination === rows.length && column.page.next_cursor)
      )
        return;
      propose(
        item,
        column.status,
        {
          after_id: rows[destination - 1]?.id ?? null,
          before_id: rows[destination]?.id ?? null,
        },
        true,
      );
    },
    gesture,
    busy: () => busy,
  });
  function columnFooter(node: HTMLElement, status: string) {
    let alive = true;
    const stopKeys = on(node, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
    void tick().then(() => {
      if (alive)
        node
          .closest(".astra-board")
          ?.querySelector(`.astra-column-${status}`)
          ?.append(node);
    });
    return {
      destroy() {
        alive = false;
        stopKeys();
        node.remove();
      },
    };
  }
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
  {#each columns as column}
    <footer class="column-footer" use:columnFooter={column.status}>
      <button
        class="add-card"
        aria-label={`Add card in ${column.status}`}
        disabled={busy || gestureActive}
        onclick={() => oncreate("card", { status: column.status })}
        >+ Add a card</button
      >
      {#if column.total > 50}
        <small>{column.items.length} of {column.total} loaded</small>
        <div class="pagination">
          {#if column.page.next_cursor}<button
              aria-label={`Next 50 in ${column.status}`}
              disabled={busy || gestureActive}
              onclick={() => load(column.status, column.page.next_cursor)}
              >Next 50</button
            >{/if}
          <button
            aria-label={`First page in ${column.status}`}
            disabled={busy || gestureActive || pageStarts[column.status]}
            onclick={() => load(column.status)}>First page</button
          >
        </div>
      {/if}
    </footer>
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
  .column-footer {
    flex-shrink: 0;
    padding: 8px;
    border-top: 1px solid var(--line);
    display: grid;
    gap: 6px;
  }
  .astra-board :global(.wx-collapsed .column-footer) {
    display: none;
  }
  .add-card {
    text-align: left;
    border: 0;
    background: transparent;
  }
  .add-card:hover {
    background: var(--hover);
  }
  .pagination {
    display: flex;
    gap: 6px;
  }
  .pagination button {
    flex: 1;
    padding: 6px;
    font-size: 13px;
  }
</style>
