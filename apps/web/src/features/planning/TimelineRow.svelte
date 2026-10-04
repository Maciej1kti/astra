<script lang="ts">
  import { getContext } from "svelte";
  import type { IRow } from "@svar-ui/svelte-grid";
  import Icon from "../../lib/ui/Icon.svelte";
  import { GANTT_CONTEXT, type GanttContext } from "./gantt-context";
  import { timelineRowGesture } from "./timeline-row-gesture";
  let { row }: { row: IRow } = $props();
  const actions = getContext<GanttContext>(GANTT_CONTEXT);
</script>

<div class="row-label" data-timeline-row={String(row.id)}>
  {#if !row.astraCreate}
    <button
      type="button"
      class="row-grip"
      aria-label={`Zmień kolejność: ${row.text}`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End"
      aria-pressed="false"
      title="Przeciągnij, aby zmienić kolejność · Alt+↑/↓/Home/End"
      disabled={!actions.editable()}
      use:timelineRowGesture={{
        id: String(row.id),
        order: actions.order,
        disabled: () => !actions.editable(),
        active: actions.gesture,
        commit: actions.reorder,
      }}><Icon name="grip" small /></button
    >
    <span>{row.text}</span>
  {:else}<span class="empty-label">Wybierz datę →</span>{/if}
</div>

<style>
  .row-label {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    width: 100%;
  }
  .row-label span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3);
    min-height: var(--tap-target);
    min-width: var(--tap-target);
    border: 0;
    background: transparent;
    cursor: grab;
    touch-action: none;
    flex-shrink: 0;
  }
  .empty-label {
    color: var(--muted);
    font-size: var(--text-sm);
  }
</style>
