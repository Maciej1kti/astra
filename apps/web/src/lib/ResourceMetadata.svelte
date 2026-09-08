<script lang="ts">
  import type { Summary } from "./api";
  import { resourceDates, resourceLabel } from "./resource-presentation";

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
      item.blocked ||
      item.archived,
  );
</script>

{#if hasState || dates.length || item.labels?.length}
  <span class="resource-metadata" class:compact>
    {#if hasState}
      <span class="state-badges">
        {#if showStatus && item.status}
          <span class="badge state" data-state={item.status}
            >{resourceLabel(item.status)}</span
          >
        {/if}
        {#if item.priority && item.priority !== "normal"}
          <span class="badge priority" data-priority={item.priority}>
            <span aria-hidden="true"
              >{item.priority === "urgent"
                ? "!!"
                : item.priority === "high"
                  ? "↑"
                  : "↓"}</span
            >
            {resourceLabel(item.priority)} priority
          </span>
        {/if}
        {#if item.archived}<span class="badge archived">Archived</span>{/if}
        {#if item.blocked}
          <span class="badge blocked" title={`Blocked: ${item.blocked.reason}`}>
            <span aria-hidden="true">!</span>
            <span class="blocked-text">Blocked: {item.blocked.reason}</span>
          </span>
        {/if}
      </span>
    {/if}
    {#if dates.length}
      <span class="date-badges">
        {#each dates as date (date.kind)}
          <span class="date" data-date-kind={date.kind}>
            <span class="date-label">{date.label}</span>
            <span class="date-value"
              ><time datetime={date.start}>{date.start}</time>{#if date.end}
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
    display: grid;
    gap: 7px;
    min-width: 0;
    margin-top: 9px;
    color: var(--ink);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    text-align: left;
  }
  .resource-metadata.compact {
    gap: 5px;
    margin-top: 6px;
  }
  .state-badges,
  .date-badges,
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }
  .badge,
  .tag {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    max-width: 100%;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 5px;
    overflow-wrap: anywhere;
    background: var(--soft);
  }
  .state,
  .priority {
    font-weight: 600;
  }
  .state[data-state="active"],
  .state[data-state="done"] {
    background: var(--plan-bg);
  }
  .state[data-state="review"] {
    background: var(--review-bg);
  }
  .priority[data-priority="high"],
  .priority[data-priority="urgent"],
  .blocked {
    color: var(--notice-ink);
    border-color: var(--notice-line);
    background: var(--notice-bg);
  }
  .priority[data-priority="urgent"] {
    border-width: 2px;
    padding: 1px 5px;
  }
  .blocked {
    min-width: 0;
  }
  .blocked-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .date-badges {
    column-gap: 10px;
  }
  .date {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 5px;
    min-width: 0;
  }
  .date-label {
    font-weight: 600;
  }
  .date[data-date-kind="hard"] {
    color: var(--notice-ink);
    background: var(--notice-bg);
    border-radius: 4px;
    padding: 1px 4px;
  }
  .date-value {
    font-variant-numeric: tabular-nums;
  }
  .tag {
    background: var(--paper);
  }
  .tag-symbol {
    color: var(--muted);
    flex-shrink: 0;
  }
</style>
