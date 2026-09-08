<script lang="ts">
  import { onMount, setContext, untrack, tick } from "svelte";
  import { on } from "svelte/events";
  import { readBoardView, writeBoardView } from "./board-view";
  import { cursorPage } from "../../lib/api/pagination";
  import { isAbortError } from "../../lib/api/read-requests";
  import {
    projectionNotice,
    type ProjectionState,
  } from "../../lib/api/projection-state";
  import { api, type Summary } from "../../lib/api/api";
  import {
    Kanban,
    Willow,
    type KanbanInstanceApi,
  } from "@svar-ui/svelte-kanban";
  import BoardCard from "./BoardCard.svelte";
  import { BOARD_CONTEXT, type BoardContext } from "./board-context";
  import type { MoveProposal } from "../planning/proposals";

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
    oncreate: (
      type: "card",
      initial: Partial<import("../../lib/contracts/api.generated").CardCreate>,
      autoCreate?: boolean,
    ) => void;
  } = $props();
  type Column =
    import("../../lib/contracts/api.generated").BoardView["columns"][number];
  let columns = $state<Column[]>([]);
  let error = $state("");
  let busy = $state(false);
  let pageStarts = $state<Record<string, boolean>>({});
  const viewState = untrack(() => readBoardView(project));
  let boardRoot: HTMLElement | undefined;
  let initialView = true;
  let restoring = false;
  let saveTimer = 0;
  let quickStatus = $state<string | null>(null);
  let quickTitles = $state<Record<string, string>>({});
  function focusTitle(node: HTMLInputElement) {
    node.focus();
  }
  function quickCreate(status: Column["status"]) {
    const title = (quickTitles[status] ?? "").trim();
    if (!title || title.length > 240 || busy || gestureActive) return;
    oncreate("card", { title, status }, true);
    quickTitles[status] = "";
  }
  function saveView() {
    writeBoardView(project, viewState);
  }
  async function restoreView(current: number) {
    await tick();
    if (current !== generation || !boardRoot) return;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    {
      if (!boardRoot || current !== generation) return;
      const scroll = boardRoot.querySelector<HTMLElement>(".date-scroll");
      if (scroll) scroll.scrollLeft = viewState.horizontal;
      for (const node of boardRoot.querySelectorAll<HTMLElement>(
        "[data-kanban-column-cards]",
      )) {
        const status = node.dataset.kanbanColumnCards?.replace(/^:/, "") ?? "";
        node.scrollTop =
          pageStarts[status] && !search ? (viewState.vertical[status] ?? 0) : 0;
      }
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (current === generation) restoring = false;
  }
  let readController: AbortController | undefined;
  let columnCursors: Record<string, string | null> = {};
  let freshness = $state("");
  let pageNotice = $state("");
  let generation = 0;
  let deferredRefresh = false;
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
      readController?.abort();
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
    if (busy && !status) {
      deferredRefresh = true;
      return;
    }
    if (gestureActive) {
      deferredRefresh = true;
      return;
    }
    const current = ++generation;
    readController?.abort();
    readController = new AbortController();
    const signal = readController.signal;
    busy = true;
    error = "";
    try {
      const requests = status
        ? [{ status, cursor: cursor ?? null }]
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
      if (current !== generation) return;
      if (gestureActive || document.querySelector("[data-dragging]")) {
        deferredRefresh = true;
        return;
      }
      const restore = initialView || !!status;
      restoring = restore;
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
        ? "The board changed. Showing the first page of the updated columns."
        : "";
      if (status) {
        viewState.vertical[status] = 0;
        columns = columns.map(
          (column) => resolved.get(column.status) ?? column,
        );
      } else columns = [...resolved.values()];
      if (restore) await restoreView(current);
      if (current === generation) initialView = false;
    } catch (e) {
      if (current === generation && !isAbortError(e)) error = String(e);
    } finally {
      if (current === generation) {
        busy = false;
        if (deferredRefresh && !gestureActive) {
          deferredRefresh = false;
          void load();
        }
      }
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

  const collapsed = new Map<string, boolean>(
    Object.entries(viewState.collapsed),
  );
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
          item.title.toLowerCase().includes(search.trim().toLowerCase()),
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
  // Load Willow's stylesheet without its inline-styled wrapper. Portals still
  // inherit the same theme context from this CSS-only wrapper's component.
  setContext("wx-theme", "willow");
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
    boardRoot = node;
    node.querySelector(".wx-scroll")?.classList.add("date-scroll");
    const scrolled = (event: Event) => {
      if (restoring || search || !(event.target instanceof HTMLElement)) return;
      const target = event.target;
      if (target.classList.contains("date-scroll"))
        viewState.horizontal = target.scrollLeft;
      else if (target.matches("[data-kanban-column-cards]")) {
        const status =
          target.dataset.kanbanColumnCards?.replace(/^:/, "") ?? "";
        if (pageStarts[status]) viewState.vertical[status] = target.scrollTop;
      } else return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveView, 150);
    };
    node.addEventListener("scroll", scrolled, true);
    return {
      destroy() {
        node.removeEventListener("scroll", scrolled, true);
        window.clearTimeout(saveTimer);
        saveView();
        boardRoot = undefined;
      },
    };
  }
  function initialize(store: KanbanInstanceApi) {
    // SVAR is a view adapter. It never commits or optimistically changes cards.
    store.intercept("add-card", (event) => {
      if ("card" in event && event.card && "column" in event.card) {
        const columnId = String(event.card.column);
        const status = columns.find(
          (column) => column.status === columnId,
        )?.status;
        if (status) oncreate("card", { status });
      }
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
      ) {
        const status = String(event.id);
        collapsed.set(status, Boolean(event.column.collapsed));
        viewState.collapsed[status] = Boolean(event.column.collapsed);
        saveView();
      }
    });
  }
</script>

{#if freshness}<p role="status" class="notice">{freshness}</p>{/if}
{#if pageNotice}<p role="status" class="hint">{pageNotice}</p>{/if}
{#if error}<p role="alert">
    {error}
    <button disabled={busy || gestureActive} onclick={() => load()}
      >Reload board</button
    >
  </p>{/if}
{#if busy && !columns.length}<p role="status">Loading board…</p>{/if}
{#if search.trim()}<p>
    Filtering searches the loaded pages only. Reordering is disabled while
    filtering.
    {#if !busy && !boardCards.length}No matching cards in the loaded pages.{/if}
  </p>{/if}
<div class="astra-board" aria-busy={busy} use:scrolling>
  <Willow fonts={false} children={undefined} />
  <div class="board-theme wx-theme wx-willow-theme">
    <Kanban
      cards={boardCards}
      columns={boardColumns}
      cardContent={BoardCard}
      card={{ menu: false }}
      init={initialize}
      render={{ fixedColumnWidth: true, virtualizeCards: false }}
    />
  </div>
  {#each columns as column}
    <footer class="column-footer" use:columnFooter={column.status}>
      {#if quickStatus === column.status}
        <form
          class="quick-add"
          onsubmit={(event) => {
            event.preventDefault();
            quickCreate(column.status);
          }}
        >
          <input
            aria-label={`New card title in ${column.status}`}
            placeholder="Card title…"
            maxlength="240"
            required
            bind:value={quickTitles[column.status]}
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
                !(quickTitles[column.status] ?? "").trim()}>Add</button
            >
            <button type="button" onclick={() => (quickStatus = null)}
              >Close</button
            >
          </div>
        </form>
      {:else}
        <button
          class="add-card"
          aria-label={`Add card in ${column.status}`}
          disabled={busy || gestureActive}
          onclick={() => {
            quickTitles[column.status] ??= "";
            quickStatus = column.status;
          }}>+ Add a card</button
        >
      {/if}
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
  .board-theme {
    height: 100%;
    min-width: 0;
  }
  .astra-board :global(.wx-willow-theme) {
    --wx-font-family: inherit;
    --wx-color-font: var(--ink);
    --wx-color-font-alt: var(--ink);
    --wx-background: var(--paper);
    --wx-background-alt: var(--soft);
    --wx-background-hover: var(--hover);
    --wx-kanban-bg: transparent;
    --wx-kanban-column-bg: var(--soft);
    --wx-kanban-card-bg: var(--paper);
    --wx-kanban-border-color: var(--line);
    --wx-border-color: var(--line);
    --wx-color-primary: var(--ink);
    --wx-icon-color: var(--ink);
    --wx-border-radius: 8px;
    --wx-kanban-card-shadow: 0 1px 2px #0000000a;
    --wx-kanban-card-shadow-hover: 0 2px 6px #00000012;
  }
  .astra-board :global(.wx-column) {
    border: 1px solid var(--line);
  }
  .astra-board :global(.wx-column-header) {
    padding: 4px;
    gap: 2px;
  }
  .astra-board :global(.wx-column-header button),
  .astra-board :global(.wx-expand) {
    min-width: 44px;
    min-height: 44px;
  }
  .astra-board :global(.wx-collapsed) {
    flex-basis: 44px;
    min-width: 44px;
    max-width: 44px;
  }
  .astra-board :global(.wx-title) {
    text-transform: capitalize;
    font-size: 14px;
  }
  .astra-board :global(.wx-card) {
    touch-action: pan-y;
    padding: 0;
    border: 1px solid var(--line);
  }
  .astra-board :global(.wx-card:hover),
  .astra-board :global(.wx-card:focus-within) {
    border-color: var(--muted);
  }
  .astra-board :global(.wx-icon) {
    color: var(--ink);
    margin-top: 0;
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
    background: var(--soft);
  }
  .astra-board :global(.wx-collapsed .column-footer) {
    display: none;
  }
  .quick-add {
    display: grid;
    gap: 6px;
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
