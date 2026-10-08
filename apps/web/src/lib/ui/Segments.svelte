<script lang="ts" generics="Value extends string | number">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons";

  /**
   * One choice among a few, all in view: a view's scale or layout, a chart's
   * range or grouping. Every view uses this control for that job.
   */
  let {
    label,
    options,
    value,
    onselect,
    children,
  }: {
    label: string;
    /** With an icon, the label names the choice instead of being shown. */
    options: { value: Value; label: string; icon?: IconName }[];
    /** Null when the current state matches none of the choices. */
    value: Value | null;
    onselect: (value: Value) => void;
    /** A trailing control that belongs to the same group. */
    children?: Snippet;
  } = $props();
</script>

<div class="segments" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      class:active={option.value === value}
      class:icon={!!option.icon}
      aria-pressed={option.value === value}
      aria-label={option.icon ? option.label : undefined}
      title={option.icon ? option.label : undefined}
      onclick={() => onselect(option.value)}
      >{#if option.icon}<Icon
          name={option.icon}
          small
        />{:else}{option.label}{/if}</button
    >
  {/each}
  {@render children?.()}
</div>

<style>
  .segments {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--soft);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    min-width: 0;
  }
  .segments :global(button) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: var(--tap-target);
    /* A narrow host may set the inline padding; see the Chart dashboard. */
    padding: var(--space-4) var(--segments-inline, var(--space-6));
    border: 0;
    border-radius: calc(var(--radius-control) - var(--space-1));
    background: transparent;
    color: var(--muted);
    font-size: var(--text-base);
    white-space: nowrap;
  }
  .segments :global(button.icon) {
    flex: 0 0 var(--tap-target);
    padding: 0;
  }
  .segments :global(button:hover) {
    color: var(--ink);
    background: var(--hover);
  }
  .segments :global(button.active) {
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow-sm);
    font-weight: var(--weight-semibold);
  }
</style>
