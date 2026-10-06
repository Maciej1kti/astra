<script lang="ts">
  import { getContext } from "svelte";
  import { on } from "svelte/events";
  import type { ITask } from "@svar-ui/svelte-gantt";
  import type { Summary } from "../../lib/api/api";
  import { GANTT_CONTEXT, type GanttContext } from "./gantt-context";
  import { dateGesture } from "./date-gesture";
  import { dateOnly } from "./widget-dates";
  import { shiftDate } from "./dates";
  import { dayDistance } from "../../lib/ui/calendar-dates";

  let { data }: { data: ITask } = $props();
  let creationDate = $state("");
  const actions = getContext<GanttContext>(GANTT_CONTEXT);
  // The creation row carries no saved item.
  const row = $derived(data.astra as Summary | undefined);
  const unit = $derived(
    row?.schedule
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
      row &&
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

<div
  class="task"
  class:create={!!data.astraCreate}
  use:isolate
  data-card-id={row?.id}
>
  {#if data.astraCreate}
    <button
      class="create-row"
      aria-label="Utwórz kartę na osi czasu"
      title="Kliknij datę, aby utworzyć kartę · Strzałki i Enter"
      onkeydown={(event) => {
        if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          creationDate = shiftDate(
            creationDate || data.astraCreateDate,
            event.key === "ArrowLeft" ? -1 : 1,
          );
        }
      }}
      onclick={(event) => {
        if (event.detail === 0) {
          actions.create(creationDate || data.astraCreateDate);
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const days = dayDistance(dateOnly(data.start!), dateOnly(data.end!));
        const offset = Math.max(
          0,
          Math.min(
            days - 1,
            Math.floor(((event.clientX - bounds.left) / bounds.width) * days),
          ),
        );
        actions.create(shiftDate(dateOnly(data.start!), offset));
      }}>+</button
    >
  {:else if row?.type === "milestone"}
    <button
      class="milestone"
      onclick={() => actions.open(row)}
      aria-label={`Termin kamienia milowego: ${row.title}`}
      >◆ {row.title}</button
    >
  {:else if row?.event}
    <button
      class="move"
      onclick={() => actions.open(row)}
      aria-label={`Wydarzenie: ${row.title}`}
      >Wydarzenie {row.event.start.slice(11)} · {row.title}</button
    >
  {:else if row?.schedule}
    <button
      class="handle edge"
      disabled={!actions.editable()}
      aria-label={`Zmień początek: ${row.title}`}
      title="Zmień początek · Alt+←/→"
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
      aria-label={`Przenieś plan: ${row.title}`}
      title={`${row.title} · Alt+←/→ przenosi; Shift zmienia tydzień`}
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
      aria-label={`Zmień koniec: ${row.title}`}
      title="Zmień koniec · Alt+←/→"
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
  .task.create {
    background: transparent;
  }
  .create-row {
    width: 100%;
    height: 100%;
    border: var(--stroke) dashed var(--line);
    background: transparent;
    color: var(--muted);
    text-align: left;
    padding-left: var(--space-6);
  }

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
    z-index: var(--layer-raised);
    background: var(--paper);
    box-shadow: var(--shadow-floating);
  }
  @media (pointer: coarse) {
    .edge {
      min-width: var(--tap-target);
    }
  }
</style>
