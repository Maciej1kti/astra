<script lang="ts">
  import { errorMessage } from "../../lib/api/messages.ts";
  import WidgetLocale from "../../lib/ui/WidgetLocale.svelte";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import { revealScene } from "../../lib/ui/motion";
  import { controlsLayers, revealLayers } from "../../lib/ui/motion-layers";
  import { onMount, onDestroy, setContext, untrack, tick } from "svelte";
  import { on } from "svelte/events";
  import { readBoardView, writeBoardView } from "./board-view";
  import { cursorPage } from "../../lib/api/pagination";
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
  const viewState = untrack(() => readBoardView(project));
  let boardRoot: HTMLElement | undefined;
  let initialView = true;
  let restoring = false;
  let saveTimer = 0;
  let quickStatus = $state<string | null>(null);
  let visibleStatus = $state<string>("planned");
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the board can unmount during the frame awaited above
      if (!boardRoot || current !== generation) return;
      const scroll = boardRoot.querySelector<HTMLElement>(".date-scroll");
      if (scroll) {
        let horizontal = viewState.horizontal;
        if (
          initialView &&
          horizontal === 0 &&
          matchMedia("(max-width: 700px)").matches
        ) {
          const query = search.trim().toLowerCase();
          const firstWithCards =
            (query &&
              columns.find((column) =>
                column.items.some((item) =>
                  item.title.toLowerCase().includes(query),
                ),
              )) ||
            columns.find((column) => column.total > 0);
          const first = scroll.querySelector<HTMLElement>(".wx-column");
          const target =
            firstWithCards &&
            scroll.querySelector<HTMLElement>(
              `.astra-column-${firstWithCards.status}`,
            );
          if (first && target) {
            horizontal = target.offsetLeft - first.offsetLeft;
            visibleStatus = firstWithCards.status;
          }
        }
        scroll.scrollLeft = horizontal;
      }
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
          ? "Tablica się zmieniła. Wyświetlono pierwszą stronę aktualnych kolumn."
          : "";
        if (status) {
          viewState.vertical[status] = 0;
          columns = columns.map(
            (column) => resolved.get(column.status) ?? column,
          );
        } else columns = [...resolved.values()];
        if (restore) await restoreView(current);
        if (current === generation) initialView = false;
      },
      failed: (cause) => {
        error = errorMessage(cause);
      },
    });
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
          label: resourceLabel(column.status),
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
      label: `${resourceLabel(column.status)} · ${column.total}`,
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
      if (restoring || !(event.target instanceof HTMLElement)) return;
      const target = event.target;
      if (target.classList.contains("date-scroll")) {
        if (!search) viewState.horizontal = target.scrollLeft;
        const first = target.querySelector<HTMLElement>(".wx-column");
        const closest = columns.reduce<{
          status: string;
          distance: number;
        } | null>((result, column) => {
          const element = target.querySelector<HTMLElement>(
            `.astra-column-${column.status}`,
          );
          if (!element || !first) return result;
          const distance = Math.abs(
            element.offsetLeft - first.offsetLeft - target.scrollLeft,
          );
          return !result || distance < result.distance
            ? { status: column.status, distance }
            : result;
        }, null);
        if (closest) visibleStatus = closest.status;
      } else if (target.matches("[data-kanban-column-cards]")) {
        if (search) return;
        const status =
          target.dataset.kanbanColumnCards?.replace(/^:/, "") ?? "";
        if (pageStarts[status]) viewState.vertical[status] = target.scrollTop;
      } else return;
      if (search) return;
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
  function showColumn(status: string) {
    const scroll = boardRoot?.querySelector<HTMLElement>(".date-scroll");
    const first = scroll?.querySelector<HTMLElement>(".wx-column");
    const column = scroll?.querySelector<HTMLElement>(
      `.astra-column-${status}`,
    );
    if (!scroll || !first || !column) return;
    visibleStatus = status;
    scroll.scrollTo({
      left: column.offsetLeft - first.offsetLeft,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
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
    {#if !busy && !boardCards.length}Brak pasujących kart na wczytanych
      stronach.{/if}
  </p>{/if}
{#if columns.length}<nav
    class="board-column-nav"
    aria-label="Kolumny tablicy"
    use:revealLayers={controlsLayers}
  >
    {#each columns as column}<button
        aria-current={visibleStatus === column.status ? "true" : undefined}
        onclick={() => showColumn(column.status)}
        >{resourceLabel(column.status)} <span>{column.total}</span></button
      >{/each}
  </nav>{/if}
<div
  use:revealScene={{
    ready: !busy && !!columns.length,
    key: project,
    selector: ".board-column-nav, .wx-column",
    cardSelector: "[data-board-card]",
    distance: "0px",
  }}
  class="astra-board"
  aria-busy={busy}
  use:scrolling
>
  <WidgetLocale>
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
  </WidgetLocale>
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
            aria-label={`Tytuł nowej karty w ${resourceLabel(column.status)}`}
            placeholder="Tytuł karty…"
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
                !(quickTitles[column.status] ?? "").trim()}>Dodaj</button
            >
            <button type="button" onclick={() => (quickStatus = null)}
              >Zamknij</button
            >
          </div>
        </form>
      {:else}
        <button
          class="add-card"
          aria-label={`Dodaj kartę w ${resourceLabel(column.status)}`}
          disabled={busy || gestureActive}
          onclick={() => {
            quickTitles[column.status] ??= "";
            quickStatus = column.status;
          }}>+ Dodaj kartę</button
        >
      {/if}
      {#if column.total > 50}
        <small>{column.items.length} z {column.total} wczytano</small>
        <div class="pagination">
          {#if column.page.next_cursor}<button
              aria-label={`Następne 50 w ${resourceLabel(column.status)}`}
              disabled={busy || gestureActive}
              onclick={() => load(column.status, column.page.next_cursor)}
              >Następne 50</button
            >{/if}
          <button
            aria-label={`Pierwsza strona w ${resourceLabel(column.status)}`}
            disabled={busy || gestureActive || pageStarts[column.status]}
            onclick={() => load(column.status)}>Pierwsza strona</button
          >
        </div>
      {/if}
    </footer>
  {/each}
</div>

<style>
  .board-column-nav {
    display: none;
  }
  .astra-board {
    min-width: 0;
    height: clamp(
      var(--board-min-height),
      var(--board-height),
      var(--dialog-max-height)
    );
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
    --wx-border-radius: var(--radius-control);
    --wx-kanban-card-shadow: var(--shadow-sm);
    --wx-kanban-card-shadow-hover: var(--shadow-card);
  }
  .astra-board :global(.wx-column) {
    border: var(--stroke) solid var(--line);
  }
  .astra-board :global(.wx-column-header) {
    padding: var(--space-2);
    gap: var(--space-1);
  }
  .astra-board :global(.wx-column-header button),
  .astra-board :global(.wx-expand) {
    min-width: var(--tap-target);
    min-height: var(--tap-target);
  }
  .astra-board :global(.wx-collapsed) {
    flex-basis: var(--tap-target);
    min-width: var(--tap-target);
    max-width: var(--tap-target);
  }
  .astra-board :global(.wx-title) {
    text-transform: capitalize;
    font-size: var(--text-base);
  }
  .astra-board :global(.wx-card) {
    touch-action: pan-y;
    padding: 0;
    border: var(--stroke) solid var(--line);
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
    font-family: var(--font-sans);
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
    padding: var(--space-4);
    border-top: var(--stroke) solid var(--line);
    display: grid;
    gap: var(--space-3);
    background: var(--soft);
  }
  .astra-board :global(.wx-collapsed .column-footer) {
    display: none;
  }
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
    font-size: var(--text-label);
  }
  @media (max-width: 700px) {
    .board-column-nav {
      display: flex;
      gap: var(--space-2);
      overflow-x: auto;
      scrollbar-width: none;
      margin-bottom: var(--space-4);
      padding-bottom: var(--space-1);
      touch-action: pan-x;
    }
    .board-column-nav button {
      flex: 0 0 auto;
      min-height: var(--tap-target);
      padding: var(--space-4) var(--space-6);
      text-transform: capitalize;
      white-space: nowrap;
      background: var(--soft);
    }
    .board-column-nav button[aria-current="true"] {
      color: var(--accent-ink);
      background: var(--accent);
      border-color: var(--accent);
    }
    .board-column-nav span {
      color: var(--muted);
      margin-left: var(--space-1);
    }
    .astra-board {
      height: clamp(320px, 52dvh, 520px);
    }
    .astra-board :global(.wx-column:not(.wx-collapsed)) {
      flex-basis: calc(100vw - var(--space-20) - var(--space-4));
      min-width: calc(100vw - var(--space-20) - var(--space-4));
    }
  }
</style>
