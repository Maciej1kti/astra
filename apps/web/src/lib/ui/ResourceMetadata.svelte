<script lang="ts">
  import type { Summary } from "../api/api";
  import {
    resourceDates,
    resourceLabel,
  } from "../resources/resource-presentation";

  let {
    item,
    showStatus = false,
    compact = false,
  }: {
    item: Summary;
    showStatus?: boolean;
    compact?: boolean;
  } = $props();

  const dates = $derived(resourceDates(item));
  const hasState = $derived(
    (showStatus && item.status) ||
      (item.priority && item.priority !== "normal") ||
      item.archived,
  );
</script>

{#if hasState || dates.length || item.labels?.length || item.acceptance_progress?.total || item.comment_count}
  <span class="resource-metadata" class:compact>
    {#if hasState}
      <span class="state-badges">
        {#if showStatus && item.status}
          <span class="badge state" data-state={item.status}
            >{resourceLabel(item.status)}</span
          >
        {/if}
        {#if item.priority === "high"}
          <span class="badge priority" data-priority={item.priority}>
            <span aria-hidden="true">↑</span>
            {resourceLabel(item.priority)} priority
          </span>
        {/if}
        {#if item.archived}<span class="badge archived">Archived</span>{/if}
      </span>
    {/if}
    {#if item.acceptance_progress?.total}
      <span class="work-badges">
        <span
          class="badge acceptance"
          title="Completed acceptance conditions; card status is set separately"
          >Checklist {item.acceptance_progress.completed}/{item
            .acceptance_progress.total}</span
        >
      </span>
    {/if}
    {#if item.comment_count}
      <span
        class="badge comments"
        aria-label={`${item.comment_count} comments`}
      >
        {item.comment_count}
        {item.comment_count === 1 ? "comment" : "comments"}
      </span>
    {/if}
    {#if dates.length}
      <span class="date-badges">
        {#each dates as date (date.kind)}
          <span class="date" data-date-kind={date.kind}>
            <span class="date-label">{date.label}</span>
            <span class="date-value"
              ><time datetime={date.start}>{date.start.replace("T", " ")}</time
              >{#if date.duration}
                · {date.duration} min{/if}{#if date.end}
                – <time datetime={date.end}>{date.end}</time>{/if}</span
            >
          </span>
        {/each}
      </span>
    {/if}
    {#if item.labels?.length}
      <span class="tags" aria-label="Tags">
        {#each item.labels as label (label)}
          <span class="tag" title={label}
            ><span class="tag-symbol" aria-hidden="true">#</span>{label}</span
          >
        {/each}
      </span>
    {/if}
  </span>
{/if}

<style>
  .resource-metadata {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4) var(--space-6);
    min-width: 0;
    margin-top: var(--space-4);
    color: var(--ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    line-height: var(--leading-body);
    text-align: left;
  }
  .resource-metadata.compact {
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .state-badges,
  .work-badges,
  .date-badges,
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    min-width: 0;
  }
  .date-badges {
    column-gap: var(--space-5);
    color: var(--muted);
  }
  .date {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
  }
  .date-label {
    font-weight: var(--weight-semibold);
  }
  .date[data-date-kind="due"] {
    color: var(--notice-ink);
    background: var(--notice-bg);
    border-radius: var(--radius-sm);
    padding: var(--stroke) var(--space-2);
  }
  .date-value {
    font-variant-numeric: tabular-nums;
  }
  .tag-symbol {
    color: var(--muted);
    flex-shrink: 0;
  }
</style>
