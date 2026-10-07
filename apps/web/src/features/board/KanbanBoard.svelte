<script lang="ts">
  import { revealScene } from "../../lib/ui/motion";
  import { controlsLayers, revealLayers } from "../../lib/ui/motion-layers";
  import WidgetLocale from "../../lib/ui/WidgetLocale.svelte";
  import { onDestroy, setContext, tick, untrack, type Snippet } from "svelte";
  import { on } from "svelte/events";
  import {
    cardBoardShape,
    readBoardView,
    writeBoardView,
    type BoardViewShape,
  } from "./board-view";
  import type { Summary } from "../../lib/api/api";
  import {
    Kanban,
    Willow,
    type KanbanInstanceApi,
  } from "@svar-ui/svelte-kanban";
  import BoardCard from "./BoardCard.svelte";
  import { boardSnapshot, playBoardMoves } from "./board-flip";
  import type { BoardGestureOptions } from "./board-gesture";
  import { BoardReflow } from "./board-reflow";
  import {
    BOARD_CONTEXT,
    type BoardContext,
    type KanbanColumn,
    type KanbanPlacement,
  } from "./board-context";

  /**
   * The one board: columns, cards, the move gesture, the phone's column bar and
   * the remembered view. Hosts supply columns and persist a requested move.
   *
   * A requested move is shown in its new place at once and stays there while the
   * host saves it. The host reports the outcome through `settle`; a move that
   * was not saved returns to where the source still has it.
   */
  let {
    viewKey,
    viewShape = cardBoardShape,
    columns,
    ordered = true,
    filter = "",
    busy = false,
    ready,
    open,
    canMove,
    rank,
    onmove,
    details,
    actions,
    footer,
  }: {
    /** Names this board's browser-local view state. */
    viewKey: string;
    viewShape?: BoardViewShape;
    columns: KanbanColumn[];
    /** Whether a card's place within its column is part of a move. */
    ordered?: boolean;
    /** A title filter over loaded cards; an ordered board cannot move while filtered. */
    filter?: string;
    busy?: boolean;
    ready: boolean;
    open: (item: Summary) => void;
    canMove?: (item: Summary) => boolean;
    /** The place of a card among its column's cards on a board without an order. */
    rank?: (item: Summary) => number;
    onmove: (
      item: Summary,
      column: KanbanColumn,
      placement: KanbanPlacement | undefined,
      settle: (saved: boolean) => void,
    ) => void;
    /** Replaces the card's resource metadata. */
    details?: Snippet<[Summary]>;
    actions?: Snippet<[Summary]>;
    footer?: Snippet<[KanbanColumn]>;
  } = $props();

  const viewState = untrack(() => readBoardView(viewKey, undefined, viewShape));
  let boardRoot: HTMLElement | undefined;
  let initialView = true;
  let restoring = false;
  let saveTimer = 0;
  let visibleColumn = $state<string>(untrack(() => viewShape.columns[0] ?? ""));
  const query = $derived(filter.trim().toLowerCase());
  type Placed = {
    item: Summary;
    to: string;
    placement?: KanbanPlacement;
    saved: boolean;
  };
  // A requested move, shown before the host has saved it.
  let placed = $state.raw<Placed | null>(null);
  let placedTimer = 0;
  let held = $state<string | null>(null);
  const frozen = $derived(busy || (ordered && !!query) || !!placed);
  const phone = () => matchMedia("(max-width: 700px)").matches;
  let kanbanApi: KanbanInstanceApi | undefined;

  /** The loaded columns with the requested move applied. */
  const shown = $derived.by(() => {
    const move = placed;
    if (!move) return columns;
    return columns.map((item) => {
      let items = item.items.filter((row) => row.id !== move.item.id);
      let total = item.total - (item.items.length - items.length);
      if (item.id === move.to) {
        const { placement } = move;
        const at = placement
          ? placement.before_id
            ? items.findIndex((row) => row.id === placement.before_id)
            : placement.after_id
              ? items.findIndex((row) => row.id === placement.after_id) + 1
              : items.length
          : rank
            ? items.findIndex((row) => rank(row) > rank(move.item))
            : -1;
        const index = at < 0 ? items.length : at;
        items = [...items.slice(0, index), move.item, ...items.slice(index)];
        total += 1;
      }
      return { ...item, items, total };
    });
  });
  function forget() {
    window.clearTimeout(placedTimer);
    placed = null;
  }
  /** Drops a shown move the host can no longer account for, such as after a failed read. */
  export function release() {
    forget();
  }
  function request(
    item: Summary,
    to: KanbanColumn,
    placement: KanbanPlacement | undefined,
  ) {
    const move: Placed = { item, to: to.id, placement, saved: false };
    window.clearTimeout(placedTimer);
    placed = move;
    onmove(item, to, placement, (saved) => {
      if (placed !== move) return;
      if (!saved) return forget();
      // The saved order arrives with the host's next columns.
      placed = { ...move, saved: true };
      placedTimer = window.setTimeout(() => {
        if (placed?.item === item) placed = null;
      }, 4000);
    });
  }
  $effect(() => {
    void columns;
    untrack(() => {
      const move = placed;
      if (!move) return;
      const at = columns.find((item) => item.id === move.to);
      const index = at?.items.findIndex((row) => row.id === move.item.id) ?? -1;
      const arrived =
        !!at &&
        index >= 0 &&
        (!move.placement ||
          (at.items[index - 1]?.id ?? null) === move.placement.after_id ||
          (at.items[index + 1]?.id ?? null) === move.placement.before_id);
      if (move.saved || arrived) forget();
    });
  });
  onDestroy(() => window.clearTimeout(placedTimer));

  function saveView() {
    writeBoardView(viewKey, viewState, undefined, viewShape);
  }
  const columnId = (node: HTMLElement | null | undefined) =>
    node?.dataset.kanbanColumnCards?.replace(/^:/, "") ?? "";
  const column = (id: string) => columns.find((item) => item.id === id);

  /** Scroll events are ignored from here until the view is restored. */
  export function holdView(value: boolean) {
    restoring = value;
  }
  /** Reapplies the remembered horizontal offset; `valid` rejects a superseded read. */
  export async function restoreView(valid: () => boolean = () => true) {
    await tick();
    if (!valid() || !boardRoot) return;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the board can unmount during the frame awaited above
      if (!boardRoot || !valid()) return;
      const scroll = boardRoot.querySelector<HTMLElement>(".date-scroll");
      if (scroll) {
        inset(scroll);
        let horizontal = viewState.horizontal;
        if (
          initialView &&
          horizontal === 0 &&
          matchMedia("(max-width: 700px)").matches
        ) {
          const firstWithCards =
            (query &&
              columns.find((item) =>
                item.items.some((row) =>
                  row.title.toLowerCase().includes(query),
                ),
              )) ||
            columns.find((item) => item.total > 0);
          const first = scroll.querySelector<HTMLElement>(".wx-column");
          const target =
            firstWithCards &&
            scroll.querySelector<HTMLElement>(
              `.astra-column-${firstWithCards.id}`,
            );
          if (first && target) {
            horizontal = target.offsetLeft - first.offsetLeft;
            visibleColumn = firstWithCards.id;
          }
        }
        scroll.scrollLeft = horizontal;
      }
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (valid()) {
      restoring = false;
      initialView = false;
    }
  }

  const home = (item: Summary) =>
    columns.find((candidate) =>
      candidate.items.some((row) => row.id === item.id),
    );
  function movable(item: Summary) {
    return !frozen && !home(item)?.locked && (canMove?.(item) ?? true);
  }
  function expand(id: string) {
    void kanbanApi?.exec("update-column", { id, column: { collapsed: false } });
  }
  /** Columns snap to where the first one rests, whatever the widget's padding. */
  function inset(scroll: HTMLElement) {
    const first = scroll.querySelector<HTMLElement>(".wx-column");
    if (!first) return;
    scroll.style.scrollPaddingInlineStart = `${Math.max(
      0,
      first.getBoundingClientRect().left -
        scroll.getBoundingClientRect().left +
        scroll.scrollLeft,
    )}px`;
  }
  const columnOf = (node: Element | null | undefined) =>
    node
      ? columns.find((item) =>
          node.classList.contains(`astra-column-${item.id}`),
        )
      : undefined;
  /** The column the pointer is in line with, also below that column's last card. */
  function columnBelow(x: number, y: number) {
    const scroll = boardRoot?.querySelector<HTMLElement>(".date-scroll");
    const area = scroll?.getBoundingClientRect();
    if (
      !scroll ||
      !area ||
      x < area.left ||
      x > area.right ||
      y < area.top ||
      y > area.bottom
    )
      return null;
    return (
      [...scroll.querySelectorAll<HTMLElement>(".wx-column")].find((node) => {
        const bounds = node.getBoundingClientRect();
        return x >= bounds.left && x <= bounds.right && y >= bounds.top;
      }) ?? null
    );
  }
  let reflow: BoardReflow | null = null;
  // Finishes a drop once the board has rendered the card in its new place.
  let arrive: (() => boolean) | null = null;
  let before: ReturnType<typeof boardSnapshot> | null = null;
  let refocus: string | null = null;
  let marked: HTMLElement | null = null;
  let lingering: { node: Element; since: number } | null = null;
  function highlight(node: HTMLElement | null, name: string) {
    if (marked === node) return;
    marked?.removeAttribute("data-board-drop-column");
    marked?.removeAttribute("data-board-drop-chip");
    marked = node;
    node?.setAttribute(name, "");
  }
  /** Runs `action` once the held card has rested on `node` for a moment. */
  function linger(node: Element, action: () => void) {
    const now = performance.now();
    if (lingering?.node !== node) lingering = { node, since: now };
    else if (now - lingering.since > 420) {
      lingering = null;
      action();
    }
  }
  function cardRect(id: string) {
    const card = boardRoot?.querySelector<HTMLElement>(
      `[data-board-card="${CSS.escape(id)}"]`,
    );
    const area = card
      ?.closest<HTMLElement>("[data-kanban-column-cards]")
      ?.getBoundingClientRect();
    const bounds = card?.getBoundingClientRect();
    // A place scrolled out of its column is nowhere to land.
    return bounds &&
      area &&
      bounds.bottom > area.top &&
      bounds.top < area.bottom &&
      bounds.right > 0 &&
      bounds.left < innerWidth
      ? bounds
      : null;
  }
  function gesture(item: Summary): BoardGestureOptions {
    let destination: {
      column: KanbanColumn;
      placement?: KanbanPlacement;
    } | null = null;
    const rest = () => {
      highlight(null, "");
      lingering = null;
    };
    return {
      disabled: () => !movable(item),
      paged: phone,
      page: (direction) => {
        const index = columns.findIndex((entry) => entry.id === visibleColumn);
        const next = columns[index + direction];
        if (next) showColumn(next.id);
      },
      lift: () => {
        const card = boardRoot?.querySelector<HTMLElement>(
          `[data-board-card="${CSS.escape(item.id)}"]`,
        );
        held = item.id;
        // Even without an order the card's own place closes behind it.
        if (boardRoot && card) reflow = new BoardReflow(boardRoot, card);
      },
      target: (x: number, y: number) => {
        destination = null;
        if (!movable(item)) return null;
        const hit = document.elementFromPoint(x, y);
        const chip = hit?.closest<HTMLElement>("[data-board-column-chip]");
        const frame =
          hit?.closest<HTMLElement>(".wx-column") ??
          (boardRoot?.contains(hit ?? null) ? columnBelow(x, y) : null);
        // Resting on a column's chip or on a collapsed column brings it into reach.
        if (chip) {
          highlight(chip, "data-board-drop-chip");
          linger(chip, () => showColumn(chip.dataset.boardColumnChip ?? ""));
          reflow?.apply(null);
          return null;
        }
        if (frame?.classList.contains("wx-collapsed")) {
          const folded = columnOf(frame);
          highlight(frame, "data-board-drop-column");
          if (folded && !folded.locked) linger(frame, () => expand(folded.id));
          reflow?.apply(null);
          return null;
        }
        lingering = null;
        const columnNode =
          hit?.closest<HTMLElement>("[data-kanban-column-cards]") ??
          frame?.querySelector<HTMLElement>("[data-kanban-column-cards]");
        const to = column(columnId(columnNode));
        const from = home(item);
        if (!to || to.locked || !from || !columnNode || !frame) {
          highlight(null, "");
          reflow?.apply(null);
          return null;
        }
        if (!ordered) {
          if (to.id === from.id) {
            highlight(null, "");
            return null;
          }
          destination = { column: to };
          highlight(frame, "data-board-drop-column");
          const rect = frame.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            key: to.id,
            area: true,
          };
        }
        const rows = to.items.filter((row) => row.id !== item.id);
        const index = reflow?.index(columnNode, y) ?? -1;
        const currentIndex = to.items.findIndex((row) => row.id === item.id);
        const placement = {
          after_id: rows[index - 1]?.id ?? null,
          before_id: rows[index]?.id ?? null,
        };
        if (
          !reflow ||
          index < 0 ||
          reflow.count(columnNode) !== rows.length ||
          (index === 0 && !to.firstPage) ||
          (index === rows.length && !to.lastPage)
        ) {
          highlight(null, "");
          reflow?.apply(null);
          return null;
        }
        highlight(frame, "data-board-drop-column");
        const box = reflow.apply({ column: columnNode, index });
        // Its own place parts the cards the same way but asks for nothing.
        if (
          !box ||
          (to.id === from.id &&
            placement.after_id === (to.items[currentIndex - 1]?.id ?? null) &&
            placement.before_id === (to.items[currentIndex + 1]?.id ?? null))
        )
          return null;
        destination = { column: to, placement };
        const area = columnNode.getBoundingClientRect();
        const top = Math.max(box.top, area.top);
        const height = Math.min(box.top + box.height, area.bottom) - top;
        if (height <= 0) return null;
        return { ...box, top, height, key: `${to.id}:${index}` };
      },
      commit: () => {
        rest();
        const move = destination;
        if (!move) {
          reflow?.clear(true);
          reflow = null;
          return cardRect(item.id);
        }
        return new Promise((resolve) => {
          const finish = () => {
            reflow?.clear(false);
            reflow = null;
            resolve(cardRect(item.id));
            return true;
          };
          // The card must be where it was asked to be before anything lands on it.
          arrive = () =>
            !!boardRoot?.querySelector(
              `.astra-column-${move.column.id} [data-board-card="${CSS.escape(item.id)}"]`,
            ) && finish();
          request(item, move.column, move.placement);
          window.setTimeout(() => {
            if (arrive) {
              arrive = null;
              finish();
            }
          }, 120);
        });
      },
      abort: () => {
        rest();
        reflow?.clear(true);
        reflow = null;
        return cardRect(item.id);
      },
      landed: () => {
        if (held === item.id) held = null;
      },
    };
  }
  /** A move asked for outside the board's own gestures, such as from a menu. */
  export function move(item: Summary, to: string) {
    const destination = column(to);
    if (ordered || !destination || destination.locked || !movable(item)) return;
    request(item, destination, undefined);
  }
  /** Moves a card one column over from the keyboard, to the end the page knows. */
  function shift(item: Summary, direction: -1 | 1) {
    const from = home(item);
    if (!from || !movable(item)) return;
    const open = columns.filter((entry) => !entry.locked);
    const to = open[open.indexOf(from) + direction];
    if (!to) return;
    const placement = !ordered
      ? undefined
      : to.lastPage
        ? { after_id: to.items.at(-1)?.id ?? null, before_id: null }
        : to.firstPage
          ? { after_id: null, before_id: to.items[0]?.id ?? null }
          : null;
    if (placement === null) return;
    if (collapsed.get(to.id)) expand(to.id);
    refocus = item.id;
    request(item, to, placement);
    if (phone()) showColumn(to.id);
  }
  function rendered(node: HTMLElement) {
    const observer = new MutationObserver(() => {
      if (arrive?.()) arrive = null;
      if (refocus) {
        const title = node.querySelector<HTMLElement>(
          `[data-board-card="${CSS.escape(refocus)}"] .title`,
        );
        // Focus follows the card through each re-render until its move is settled.
        if (
          title &&
          (document.activeElement === document.body ||
            node.contains(document.activeElement))
        )
          title.focus({ preventScroll: true });
        if (!placed) refocus = null;
      }
      if (!before || reflow) return;
      const moved = before;
      before = null;
      playBoardMoves(node, moved, held ?? undefined);
    });
    observer.observe(node, { childList: true, subtree: true });
    return { destroy: () => observer.disconnect() };
  }

  const collapsed = new Map<string, boolean>(
    Object.entries(viewState.collapsed),
  );
  const boardColumns = $derived(
    shown.map((item) => ({
      id: item.id,
      label: `${item.label} · ${item.total}`,
      cardLimit: false,
      collapsed: collapsed.get(item.id) ?? false,
      css: `astra-column-${item.id}`,
    })),
  );
  const boardCards = $derived(
    shown.flatMap((item) =>
      item.items
        .filter((row) => row.title.toLowerCase().includes(query))
        .map((row) => ({
          id: row.id,
          column: item.id,
          label: row.title,
          astra: row,
        })),
    ),
  );
  // Re-rendered cards are played as movement from where they were.
  $effect.pre(() => {
    void boardCards;
    if (!boardRoot || reflow) return;
    before = boardSnapshot(boardRoot);
    const taken = before;
    requestAnimationFrame(() => {
      if (before === taken) before = null;
    });
  });
  const loaded = $derived(
    new Map(columns.flatMap((item) => item.items.map((row) => [row.id, row]))),
  );
  setContext<BoardContext>(BOARD_CONTEXT, {
    current: (id) => loaded.get(id),
    open: (item) => open(item),
    reorder: (item, direction) => {
      const from = home(item);
      if (!ordered || !from || !movable(item)) return;
      const index = from.items.findIndex((row) => row.id === item.id);
      const rows = from.items.filter((row) => row.id !== item.id);
      const destination = index + direction;
      if (
        destination < 0 ||
        destination > rows.length ||
        (destination === 0 && !from.firstPage) ||
        (destination === rows.length && !from.lastPage)
      )
        return;
      refocus = item.id;
      request(item, from, {
        after_id: rows[destination - 1]?.id ?? null,
        before_id: rows[destination]?.id ?? null,
      });
    },
    shift,
    held: () => held,
    movable,
    gesture,
    busy: () => busy,
    ordered: () => ordered,
    details: () => details,
    actions: () => actions,
  });
  // Load Willow's stylesheet without its inline-styled wrapper. Portals still
  // inherit the same theme context from this CSS-only wrapper's component.
  setContext("wx-theme", "willow");
  function columnFooter(node: HTMLElement, id: string) {
    let alive = true;
    const stopKeys = on(node, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
    void tick().then(() => {
      if (alive)
        node
          .closest(".astra-board")
          ?.querySelector(`.astra-column-${id}`)
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
        if (!query) viewState.horizontal = target.scrollLeft;
        const first = target.querySelector<HTMLElement>(".wx-column");
        const closest = columns.reduce<{
          id: string;
          distance: number;
        } | null>((result, item) => {
          const element = target.querySelector<HTMLElement>(
            `.astra-column-${item.id}`,
          );
          if (!element || !first) return result;
          const distance = Math.abs(
            element.offsetLeft - first.offsetLeft - target.scrollLeft,
          );
          return !result || distance < result.distance
            ? { id: item.id, distance }
            : result;
        }, null);
        if (closest) visibleColumn = closest.id;
      } else return;
      if (query) return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveView, 150);
    };
    node.addEventListener("scroll", scrolled, true);
    const sized = new ResizeObserver(fit);
    const watched = new WeakSet<Element>();
    const watch = () => {
      for (const item of node.querySelectorAll(".wx-column")) {
        if (watched.has(item)) continue;
        watched.add(item);
        sized.observe(item);
      }
    };
    const columnsChanged = new MutationObserver(watch);
    columnsChanged.observe(node, { childList: true, subtree: true });
    watch();
    const stopResize = on(window, "resize", fit);
    return {
      destroy() {
        sized.disconnect();
        columnsChanged.disconnect();
        stopResize();
        node.removeEventListener("scroll", scrolled, true);
        window.clearTimeout(saveTimer);
        saveView();
        boardRoot = undefined;
      },
    };
  }
  /**
   * A phone shows one column as a page, so the board is as tall as that column
   * and the page never scrolls past its last card into a longer neighbour.
   */
  function fit() {
    const scroll = boardRoot?.querySelector<HTMLElement>(".date-scroll");
    if (!scroll) return;
    const page = phone()
      ? scroll.querySelector<HTMLElement>(`.astra-column-${visibleColumn}`)
      : null;
    scroll.style.height = page ? `${page.offsetHeight}px` : "";
  }
  $effect(() => {
    void visibleColumn;
    fit();
  });
  /** Keeps the chip of the column in view inside its own strip. */
  function current(node: HTMLElement, active: boolean) {
    const reveal = (value: boolean) => {
      const strip = node.parentElement;
      if (!value || !strip || strip.scrollWidth <= strip.clientWidth) return;
      strip.scrollTo({
        left: node.offsetLeft - (strip.clientWidth - node.offsetWidth) / 2,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    };
    reveal(active);
    return { update: reveal };
  }
  function showColumn(id: string) {
    const scroll = boardRoot?.querySelector<HTMLElement>(".date-scroll");
    const first = scroll?.querySelector<HTMLElement>(".wx-column");
    const target = scroll?.querySelector<HTMLElement>(`.astra-column-${id}`);
    if (!scroll || !first || !target) return;
    // A page of the phone board is a whole column, never its collapsed strip.
    if (phone() && collapsed.get(id)) expand(id);
    visibleColumn = id;
    inset(scroll);
    scroll.scrollTo({
      left: target.offsetLeft - first.offsetLeft,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  function initialize(store: KanbanInstanceApi) {
    kanbanApi = store;
    // SVAR is a view adapter. It never commits or optimistically changes cards.
    for (const action of [
      "add-card",
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
        const id = String(event.id);
        collapsed.set(id, Boolean(event.column.collapsed));
        viewState.collapsed[id] = Boolean(event.column.collapsed);
        saveView();
      }
    });
  }
</script>

{#if columns.length}<nav
    class="board-column-nav"
    aria-label="Kolumny tablicy"
    use:revealLayers={controlsLayers}
  >
    {#each shown as item (item.id)}<button
        data-board-column-chip={item.id}
        use:current={visibleColumn === item.id}
        aria-current={visibleColumn === item.id ? "true" : undefined}
        onclick={() => showColumn(item.id)}
        >{item.label} <span>{item.total}</span></button
      >{/each}
  </nav>{/if}
<div
  use:revealScene={{
    ready,
    key: viewKey,
    selector: ".board-column-nav, .wx-column",
    cardSelector: "[data-board-card]",
    distance: "0px",
  }}
  class="astra-board"
  aria-busy={busy}
  data-board-pending={placed ? "" : undefined}
  use:scrolling
  use:rendered
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
  {#if footer}{#each columns as item (item.id)}
      <footer class="column-footer" use:columnFooter={item.id}>
        {@render footer(item)}
      </footer>
    {/each}{/if}
</div>

<style>
  /* A held card keeps one cursor wherever it travels. */
  :global(html[data-board-dragging]),
  :global(html[data-board-dragging] *) {
    cursor: grabbing !important;
  }
  .board-column-nav {
    display: none;
  }
  /* The board is as tall as its longest column; the page scrolls, not a column. */
  .astra-board,
  .board-theme {
    min-width: 0;
  }
  .astra-board .board-theme :global(.wx-board .wx-content) {
    height: auto;
    min-height: 0;
    align-items: flex-start;
  }
  .astra-board .board-theme :global(.wx-board .wx-column.wx-column) {
    height: auto;
    max-height: none;
  }
  .astra-board :global(.wx-column-cards) {
    flex: none;
    min-height: var(--board-column-min-height);
    overflow: visible;
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
    --wx-kanban-card-shadow: var(--shadow-card);
    --wx-kanban-card-shadow-hover: var(--shadow-card);
  }
  .astra-board :global(.wx-column) {
    border: 0;
    border-radius: var(--radius-panel);
    overflow: hidden;
  }
  /* A board with few columns shares the spare width instead of leaving it empty. */
  .astra-board :global(.wx-column:not(.wx-collapsed)) {
    flex-grow: 1;
    max-width: var(--board-column-max-width);
  }
  .astra-board :global(.wx-column-header) {
    padding: var(--space-2);
    gap: var(--space-1);
    border: 0;
    background: transparent;
  }
  /* Hosts add cards from the column footer or the page action. */
  .astra-board :global(.wx-add) {
    display: none;
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
    align-self: stretch;
    min-height: var(--board-collapsed-min-height);
  }
  /* A collapsed column reads downwards from its top, however tall the board. */
  .astra-board :global(.wx-collapsed .wx-title) {
    position: static;
    max-width: none;
    padding-block: var(--space-2);
    transform: none;
    writing-mode: vertical-rl;
  }
  .astra-board :global(.wx-title) {
    font-size: var(--text-base);
  }
  .astra-board :global(.wx-card) {
    /* Both scroll directions start on a card; a hold lifts it instead. */
    touch-action: pan-x pan-y;
    padding: 0;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
  }
  /* A held card leaves its place; the preview carries it. */
  .astra-board :global(.wx-card-row:has([data-board-held])),
  .astra-board :global(.wx-card-row:has([data-dragging])) {
    opacity: 0;
  }
  .astra-board :global(.wx-column) {
    transition: background-color var(--motion-quick) var(--motion-ease);
  }
  .astra-board :global(.wx-column[data-board-drop-column]) {
    background: var(--hover);
  }
  @media (prefers-reduced-motion: no-preference) {
    .astra-board :global(.wx-card) {
      transition: transform var(--motion-quick) var(--motion-ease);
    }
    /* A touched card sinks while the hold that lifts it runs. */
    .astra-board :global(.wx-card:has([data-pressing])) {
      transform: scale(var(--motion-press));
    }
    .astra-board:global([data-board-reflow]) :global(.wx-card-row) {
      transition: transform var(--motion-quick) var(--motion-ease);
    }
  }
  .astra-board :global(.wx-card:hover),
  .astra-board :global(.wx-card:focus-within) {
    border-color: var(--line-strong);
  }
  .astra-board :global(.wx-icon) {
    color: var(--muted);
    margin-top: 0;
  }
  /* Collapse and expand use the interface chevron instead of a text glyph. */
  .astra-board :global(.wx-icon::before) {
    content: "";
    display: block;
    width: var(--space-4);
    height: var(--space-4);
    border-inline-start: var(--focus-width) solid currentColor;
    border-block-end: var(--focus-width) solid currentColor;
    rotate: 45deg;
  }
  .astra-board :global(.wxi-angle-right::before) {
    rotate: -135deg;
  }
  .column-footer {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-4) var(--space-4);
    display: grid;
    gap: var(--space-3);
    background: var(--soft);
  }
  .astra-board :global(.wx-collapsed .column-footer) {
    display: none;
  }
  @media (max-width: 700px) {
    .board-column-nav {
      display: flex;
      gap: var(--space-2);
      overflow-x: auto;
      scrollbar-width: none;
      /* The strip stays under the header, naming the column in view. */
      position: sticky;
      top: calc(var(--header-height) + env(safe-area-inset-top, 0px));
      z-index: var(--layer-raised);
      margin-bottom: var(--space-2);
      padding-block: var(--space-3);
      background: var(--paper);
      touch-action: pan-x;
    }
    .board-column-nav button {
      flex: 0 0 auto;
      min-height: var(--tap-target);
      padding: var(--space-4) var(--space-6);
      white-space: nowrap;
      background: var(--soft);
    }
    .board-column-nav button[aria-current="true"] {
      color: var(--accent-ink);
      background: var(--accent);
      border-color: var(--accent);
    }
    .board-column-nav button:global([data-board-drop-chip]) {
      border-color: var(--ink);
    }
    .board-column-nav span {
      color: var(--muted);
      margin-left: var(--space-1);
    }
    /* Columns are pages: a swipe always comes to rest on one. */
    .astra-board :global(.date-scroll) {
      scroll-snap-type: x mandatory;
      overscroll-behavior-x: contain;
    }
    .astra-board :global(.wx-column) {
      scroll-snap-align: start;
    }
    .astra-board :global(.wx-column:not(.wx-collapsed)) {
      flex-basis: calc(100vw - var(--space-20) - var(--space-4));
      min-width: calc(100vw - var(--space-20) - var(--space-4));
      max-width: none;
      flex-grow: 0;
    }
  }
</style>
