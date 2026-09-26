<script lang="ts">
  import { getContext } from "svelte";
  import { on } from "svelte/events";
  import type { ITask } from "@svar-ui/svelte-gantt";
  import type { Summary } from "../../lib/api/api";
  import { GANTT_CONTEXT, type GanttContext } from "./gantt-context";
  import { dateGesture } from "./date-gesture";
  import { dayDistance } from "./dates";

  let { data }: { data: ITask } = $props();
  const actions = getContext<GanttContext>(GANTT_CONTEXT);
  const row = $derived(data.astra as Summary);
  const unit = $derived(
    row.schedule
      ? Number(data.$w) /
          (dayDistance(row.schedule.start, row.schedule.end) + 1)
      : 48,
  );
  function isolate(node: HTMLElement) {
    const cleanups = ["pointerdown", "click", "dblclick", "keydown"].map(
      (name) => on(node, name, (event) => event.stopPropagation()),
    );
    return { destroy: () => cleanups.forEach((fn) => fn()) };
  }
  function keyboard(event: KeyboardEvent, operation: "move" | "start" | "end") {
    if (
      event.altKey &&
      ["ArrowLeft", "ArrowRight"].includes(event.key) &&
      actions.editable()
    ) {
      event.preventDefault();
      actions.propose(
        row,
        (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1),
        operation,
      );
    }
  }
</script>

<div class="task" use:isolate data-card-id={row.id}>
  {#if row.type === "milestone"}
    <button
      class="milestone"
      onclick={() => actions.open(row)}
      aria-label={`Due milestone: ${row.title}`}>◆ {row.title}</button
    >
  {:else if row.event}
    <button
      class="move"
      onclick={() => actions.open(row)}
      aria-label={`Event: ${row.title}`}
      >Event {row.event.start.slice(11)} · {row.title}</button
    >
  {:else if row.schedule}
    <button
      class="handle edge"
      disabled={!actions.editable()}
      aria-label={`Resize start: ${row.title}`}
      title="Resize start · Alt+←/→"
      use:dateGesture={{
        active: actions.gesture,
        delta: (x, _y, sx) => Math.round((x - sx) / unit),
        commit: (days) => actions.propose(row, days, "start"),
        operation: "start",
      }}
      onkeydown={(e) => keyboard(e, "start")}
      onclick={() => actions.propose(row, 0, "start")}>‹</button
    >
    <button
      class="handle move"
      disabled={!actions.editable()}
      aria-label={`Move plan: ${row.title}`}
      title={`${row.title} · Alt+←/→ to move; Shift for a week`}
      use:dateGesture={{
        active: actions.gesture,
        delta: (x, _y, sx) => Math.round((x - sx) / unit),
        commit: (days) => actions.propose(row, days, "move"),
        operation: "move",
      }}
      onkeydown={(e) => keyboard(e, "move")}
      onclick={() => actions.propose(row, 0, "move")}>{row.title}</button
    >
    <button
      class="handle edge"
      disabled={!actions.editable()}
      aria-label={`Resize end: ${row.title}`}
      title="Resize end · Alt+←/→"
      use:dateGesture={{
        active: actions.gesture,
        delta: (x, _y, sx) => Math.round((x - sx) / unit),
        commit: (days) => actions.propose(row, days, "end"),
        operation: "end",
      }}
      onkeydown={(e) => keyboard(e, "end")}
      onclick={() => actions.propose(row, 0, "end")}>›</button
    >
  {/if}
</div>

<style>
  .task {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    color: var(--ink);
    border-radius: var(--radius-sm);
    background: var(--accent);
  }
  button {
    color: inherit;
    border: 0;
    background: transparent;
    min-height: var(--tap-target);
    padding: 0 var(--space-2);
    font: inherit;
  }
  .handle {
    touch-action: none;
    cursor: grab;
  }
  .edge {
    min-width: var(--space-8);
    flex: 0 0 var(--space-8);
  }
  .move {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .milestone {
    white-space: nowrap;
  }
  button:focus-visible {
    outline: var(--focus-width) solid var(--accent);
    outline-offset: var(--focus-width);
  }
  button:global([data-dragging]) {
    z-index: 5;
    background: var(--paper);
    box-shadow: var(--shadow-floating);
  }
  @media (pointer: coarse) {
    .edge {
      min-width: var(--tap-target);
    }
  }
</style>
