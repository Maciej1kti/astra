<script lang="ts" generics="Value extends string | number">
  import type { Snippet } from "svelte";

  let {
    label,
    options,
    value,
    onselect,
    children,
  }: {
    label: string;
    options: { value: Value; label: string }[];
    /** Null when the current state matches none of the choices. */
    value: Value | null;
    onselect: (value: Value) => void;
    /** A trailing control that belongs to the same group. */
    children?: Snippet;
  } = $props();
</script>

<div class="chart-segments" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      class:active={option.value === value}
      aria-pressed={option.value === value}
      onclick={() => onselect(option.value)}>{option.label}</button
    >
  {/each}
  {@render children?.()}
</div>

<style>
  .chart-segments {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--soft);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    min-width: 0;
  }
  .chart-segments :global(button) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: var(--tap-target);
    padding: var(--space-4) var(--space-6);
    border: 0;
    border-radius: calc(var(--radius-control) - var(--space-1));
    background: transparent;
    color: var(--muted);
    font-size: var(--text-base);
    white-space: nowrap;
  }
  .chart-segments :global(button:hover) {
    color: var(--ink);
    background: var(--hover);
  }
  .chart-segments :global(button.active) {
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow-sm);
    font-weight: var(--weight-semibold);
  }
  @container chart (max-width: 400px) {
    .chart-segments :global(button) {
      padding-inline: var(--space-2);
    }
  }
</style>
