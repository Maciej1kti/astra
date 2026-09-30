<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    title,
    id,
    count,
    countLabel,
    level = 2,
    visuallyHidden = false,
    actions,
  }: {
    title: string;
    id?: string;
    count?: string | number;
    countLabel?: string;
    level?: 2 | 3;
    visuallyHidden?: boolean;
    actions?: Snippet;
  } = $props();
</script>

<div
  class="sectiontitle"
  class:sectiontitle-compact={level === 3}
  class:sr={visuallyHidden && !actions}
>
  {#if level === 3}<h3 {id} class:sr={visuallyHidden}>{title}</h3>{:else}<h2
      {id}
      class:sr={visuallyHidden}
    >
      {title}
    </h2>{/if}
  {#if count !== undefined}<span
      class:sr={visuallyHidden}
      aria-label={countLabel}>{count}</span
    >{/if}
  {#if actions}<div class="sectiontitle-actions">{@render actions()}</div>{/if}
</div>

<style>
  .sectiontitle-compact {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .sectiontitle-compact h3 {
    margin: 0;
    font-size: var(--text-card);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
  }
  .sectiontitle-compact > span {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--soft);
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .sectiontitle-actions {
    margin-left: auto;
    min-width: 0;
  }
</style>
