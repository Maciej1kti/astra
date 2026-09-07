<script lang="ts">
  import { getContext } from "svelte";
  import { on } from "svelte/events";
  import type { KanbanCard } from "@svar-ui/kanban-store";
  import type { Summary } from "./api";
  import { BOARD_CONTEXT, type BoardContext } from "./board-context";
  import { boardGesture } from "./board-gesture";
  let { card }: { card: KanbanCard } = $props();
  const actions = getContext<BoardContext>(BOARD_CONTEXT);
  const item = $derived(card.astra as Summary);
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
  use:isolate
  use:boardGesture={actions.gesture(item)}
>
  <button
    class="title"
    disabled={actions.busy()}
    onclick={() => actions.open(item)}
    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
    title="Drag to move; click to edit. Alt+Up or Alt+Down changes order."
    onkeydown={(event) => {
      if (
        event.altKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        event.stopPropagation();
        actions.reorder(item, event.key === "ArrowUp" ? -1 : 1);
      }
    }}
  >
    <h3>{item.title}</h3>
    <div class="metadata">
      {#if item.priority && item.priority !== "normal"}<span
          >{item.priority}</span
        >{/if}
      {#if item.blocked}<span title={item.blocked.reason}>Blocked</span>{/if}
      {#if item.due}<span>Due: {item.due.date}</span>{/if}
      {#if item.schedule}<span
          >Schedule: {item.schedule.start} – {item.schedule.end}</span
        >{/if}
      {#if item.review_on}<span>Review: {item.review_on}</span>{/if}
      {#each item.labels ?? [] as label}<span class="tag">{label}</span>{/each}
    </div>
  </button>
</article>

<style>
  article {
    color: var(--ink);
    cursor: grab;
    user-select: none;
    -webkit-touch-callout: none;
  }
  article:global([data-dragging]) {
    opacity: 0.35;
  }
  .title {
    display: block;
    width: 100%;
    min-height: 64px;
    padding: 14px;
    text-align: left;
    border: 0;
    background: none;
    cursor: inherit;
    color: inherit;
  }
  h3 {
    font-size: 15px;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12px;
    margin-top: 8px;
  }
  .metadata:empty {
    display: none;
  }
  .tag {
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 4px;
  }
</style>
