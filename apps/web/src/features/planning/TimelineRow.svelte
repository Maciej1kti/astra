<script lang="ts">
  import Icon from "../../lib/ui/Icon.svelte";
  import { timelineRowGesture } from "./timeline-row-gesture";

  let {
    id,
    title,
    editable,
    order,
    gesture,
    reorder,
    onopen,
  }: {
    id: string;
    title: string;
    editable: () => boolean;
    order: () => string[];
    gesture: (active: boolean) => void;
    reorder: (id: string, destination: number) => void;
    onopen: () => void;
  } = $props();
</script>

<div class="row-label" data-timeline-row={id}>
  <button
    type="button"
    class="row-grip"
    aria-label={`Zmień kolejność: ${title}`}
    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End"
    aria-pressed="false"
    title="Przeciągnij, aby zmienić kolejność · Alt+↑/↓/Home/End"
    disabled={!editable()}
    use:timelineRowGesture={{
      id,
      order,
      disabled: () => !editable(),
      active: gesture,
      commit: reorder,
    }}><Icon name="grip" small /></button
  >
  <!-- The bar in this row opens the same card and is the keyboard's stop. -->
  <button type="button" class="row-title" tabindex="-1" {title} onclick={onopen}
    ><span>{title}</span></button
  >
</div>

<style>
  .row-label {
    --grip-rest: 0.45;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 100%;
    padding-left: var(--space-2);
  }
  button {
    min-height: 0;
    border: 0;
    background: transparent;
  }
  .row-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--space-11);
    height: var(--space-11);
    margin-right: var(--space-2);
    padding: 0;
    border-radius: var(--radius-sm);
    color: var(--muted);
    opacity: var(--grip-rest);
    cursor: grab;
    touch-action: none;
    transition: opacity var(--motion-quick) var(--motion-ease);
  }
  .row-label:hover .row-grip,
  .row-grip:focus-visible,
  .row-grip:global([data-dragging]) {
    opacity: 1;
  }
  .row-grip:disabled {
    cursor: default;
  }
  /* Rows touch, so a ring outside the grip would be cut by the next row. */
  .row-grip:focus-visible {
    outline-offset: calc(var(--focus-width) * -1);
  }
  .row-title {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 var(--space-6) 0 var(--space-1);
    border-radius: 0;
    font-size: var(--text-base);
    text-align: left;
  }
  .row-title span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-title:hover span {
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: var(--space-2);
  }
  /* A narrow column shows two whole lines of a title, never a cut one. */
  :global(.compact) .row-title {
    padding-right: var(--space-4);
    font-size: var(--text-sm);
    line-height: var(--leading-tight);
  }
  :global(.compact) .row-title span {
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
  }
  :global(.compact) .row-grip {
    margin-right: 0;
  }
  @media (pointer: coarse) {
    .row-grip {
      opacity: 1;
    }
  }
</style>
