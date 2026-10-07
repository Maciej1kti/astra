<script lang="ts">
  import { getContext } from "svelte";
  import { on } from "svelte/events";
  import type { KanbanCard } from "@svar-ui/kanban-store";
  import type { Summary } from "../../lib/api/api";
  import { BOARD_CONTEXT, type BoardContext } from "./board-context";
  import { boardGesture } from "./board-gesture";
  import ResourceMetadata from "../../lib/ui/ResourceMetadata.svelte";

  let { card }: { card: KanbanCard } = $props();
  const board = getContext<BoardContext>(BOARD_CONTEXT);
  const item = $derived(
    board.current(String(card.id)) ?? (card.astra as Summary),
  );
  // A card of a locked column opens but is never carried.
  const fixed = $derived(!board.busy() && !board.movable(item));
  const details = $derived(board.details());
  const actions = $derived(board.actions());
  // Stop SVAR's drag listener at the card boundary; the card surface owns the gesture.
  function isolate(node: HTMLElement) {
    const wrapper = node.closest(".wx-card");
    wrapper?.removeAttribute("role");
    wrapper?.removeAttribute("tabindex");
    wrapper?.removeAttribute("aria-label");
    const stop = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        event.key !== "Enter" &&
        event.key !== " "
      )
        return;
      event.stopPropagation();
    };
    const cleanups = (
      ["pointerdown", "click", "dblclick", "keydown"] as const
    ).map((name) => on(node, name, stop));
    return {
      destroy() {
        cleanups.forEach((cleanup) => cleanup());
      },
    };
  }
</script>

<article
  data-board-card={item.id}
  data-board-status={item.status}
  data-board-held={board.held() === item.id ? "" : undefined}
  class:fixed
  use:isolate
  use:boardGesture={board.gesture(item)}
>
  <button
    class="title"
    aria-disabled={board.busy() ? "true" : undefined}
    onclick={() => {
      // A busy board keeps the card focusable; it only declines to open it.
      if (!board.busy()) board.open(item);
    }}
    aria-keyshortcuts={fixed
      ? undefined
      : board.ordered()
        ? "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        : "Alt+ArrowLeft Alt+ArrowRight"}
    title={fixed
      ? "Kliknij, aby otworzyć."
      : board.ordered()
        ? "Przeciągnij, aby przenieść; kliknij, aby edytować. Alt+strzałki przenoszą kartę."
        : "Przeciągnij, aby przenieść; kliknij, aby otworzyć. Alt+← lub Alt+→ zmienia kolumnę."}
    onkeydown={(event) => {
      if (!event.altKey || !event.key.startsWith("Arrow")) return;
      const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
      if (vertical && !board.ordered()) return;
      event.preventDefault();
      event.stopPropagation();
      const direction =
        event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
      if (vertical) board.reorder(item, direction);
      else board.shift(item, direction);
    }}
  >
    <h3>{item.title}</h3>
    {#if details}{@render details(item)}{:else}<ResourceMetadata
        {item}
        compact
      />{/if}
  </button>
  {#if actions}<div class="actions">{@render actions(item)}</div>{/if}
</article>

<style>
  article {
    display: flex;
    align-items: flex-start;
    color: var(--ink);
    cursor: grab;
    user-select: none;
    -webkit-touch-callout: none;
  }
  article.fixed {
    cursor: pointer;
  }
  .title {
    display: block;
    flex: 1;
    min-width: 0;
    min-height: var(--space-20);
    padding: var(--space-7);
    text-align: left;
    border: 0;
    background: none;
    cursor: inherit;
    color: inherit;
    border-radius: var(--radius-sm);
  }
  .title:focus-visible {
    outline: var(--focus-width) solid var(--ink);
    outline-offset: var(--focus-width);
  }
  h3 {
    font-size: var(--text-lg);
    margin: 0;
    overflow-wrap: anywhere;
  }
  .actions {
    flex: none;
    color: var(--muted);
    cursor: default;
  }
  .actions :global(button) {
    color: inherit;
  }
</style>
