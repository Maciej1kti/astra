<script lang="ts">
  import { getContext } from "svelte";
  import { on } from "svelte/events";
  import type { KanbanCard } from "@svar-ui/kanban-store";
  import type { Summary } from "./api";
  import { BOARD_CONTEXT, type BoardContext } from "./board-context";
  import { dateGesture } from "./date-gesture";
  let { card }: { card: KanbanCard } = $props();
  const actions = getContext<BoardContext>(BOARD_CONTEXT);
  const item = $derived(card.astra as Summary);
  // Stop SVAR's drag listener at the card boundary; the handle owns the gesture.
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

<article data-board-card={item.id} data-board-status={item.status} use:isolate>
  <button class="title" onclick={() => actions.open(item)}
    ><h3>{item.title}</h3></button
  >
  <div class="metadata">
    {#if item.priority && item.priority !== "normal"}<span>{item.priority}</span
      >{/if}
    {#if item.blocked}<span title={item.blocked.reason}>Blocked</span>{/if}
    {#if item.due}<span>Due: {item.due.date}</span>{/if}
    {#if item.schedule}<span
        >Schedule: {item.schedule.start} – {item.schedule.end}</span
      >{/if}
    {#if item.review_on}<span>Review: {item.review_on}</span>{/if}
    {#each item.labels ?? [] as label}<span class="tag">{label}</span>{/each}
  </div>
  <div class="actions">
    <button
      class="handle"
      aria-label={`Reorder: ${item.title}`}
      disabled={actions.disabled()}
      use:dateGesture={actions.gesture(item)}>↕</button
    >
    <select
      aria-label={`Move ${item.title} to`}
      value=""
      disabled={actions.busy()}
      onchange={(event) => {
        actions.propose(item, event.currentTarget.value);
        event.currentTarget.value = "";
      }}
    >
      <option value="" disabled>Move to…</option>
      {#each ["planned", "active", "review", "done", "cancelled"] as status}<option
          value={status}>{status}</option
        >{/each}
    </select>
    <details>
      <summary aria-label={`Actions: ${item.title}`}>•••</summary>
      <div class="menu">
        <button onclick={() => actions.open(item)}>Edit / manage focus</button>
        <button onclick={() => actions.update(item)}>Add update</button>
      </div>
    </details>
  </div>
</article>

<style>
  article {
    position: relative;
    color: var(--ink);
    padding: 8px;
  }
  .title {
    width: 100%;
    padding: 2px;
    text-align: left;
    border: 0;
    background: none;
  }
  h3 {
    font-size: 15px;
    margin: 4px 0;
    overflow-wrap: anywhere;
  }
  .metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12px;
    margin: 6px 0;
  }
  .tag {
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 4px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .handle {
    touch-action: none;
    cursor: grab;
    min-width: 44px;
    min-height: 44px;
  }
  .handle:global([data-dragging]) {
    z-index: 10;
    pointer-events: none;
  }
  select {
    min-width: 0;
    flex: 1;
    width: 110px;
  }
  summary {
    cursor: pointer;
    padding: 10px 5px;
    list-style: none;
  }
  .menu {
    display: grid;
    gap: 4px;
    padding-top: 6px;
  }
  details[open] {
    position: absolute;
    right: 8px;
    bottom: 0;
    z-index: 2;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px;
  }
</style>
