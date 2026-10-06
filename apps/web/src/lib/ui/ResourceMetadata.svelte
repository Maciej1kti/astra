<script lang="ts">
  import { counted, formatCivilDate, formatCivilRange } from "./locale";
  import Icon from "./Icon.svelte";
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

{#if hasState || dates.length || item.labels?.length || item.acceptance_progress?.total || item.comment_count || item.counter_count}
  <span class="resource-metadata" class:compact>
    <span class="facts">
      {#if showStatus && item.status}
        <span class="badge state" data-state={item.status}
          >{resourceLabel(item.status)}</span
        >
      {/if}
      {#if item.priority === "high"}
        <span class="fact priority" title="Wysoki priorytet"
          ><Icon name="flag" small /><span class="sr">Wysoki priorytet</span
          ></span
        >
      {/if}
      {#if item.archived}<span class="badge archived">Zarchiwizowane</span>{/if}
      {#each dates as date (date.kind)}
        <span class="fact date" data-date-kind={date.kind}>
          {#if date.kind === "due"}<span class="date-label">{date.label}</span
            >{:else}<Icon name="calendar" small /><span class="sr"
              >{date.label}</span
            >{/if}
          <time datetime={date.start}
            >{date.kind === "event"
              ? `${formatCivilDate(date.start)}, ${date.start.slice(11, 16)}`
              : formatCivilRange(date.start, date.end)}</time
          >{#if date.duration}<span>· {date.duration} min</span>{/if}
        </span>
      {/each}
      {#if item.acceptance_progress?.total}
        <span
          class="fact acceptance"
          title="Ukończone warunki akceptacji; status karty jest ustawiany osobno"
          ><Icon name="check" small /><span class="sr"
            >Lista kontrolna:&nbsp;</span
          >{item.acceptance_progress.completed}/{item.acceptance_progress
            .total}</span
        >
      {/if}
      {#if item.counter_count}<span class="fact"
          >{counted(
            item.counter_count,
            "licznik",
            "liczniki",
            "liczników",
          )}</span
        >{/if}
      {#if item.comment_count}
        <span class="fact comments"
          >{counted(
            item.comment_count,
            "komentarz",
            "komentarze",
            "komentarzy",
          )}</span
        >
      {/if}
    </span>
    {#if item.labels?.length}
      <span class="tags" aria-label="Tagi">
        {#each item.labels as label (label)}
          <span class="tag" title={label}>{label}</span>
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
    gap: var(--space-3) var(--space-6);
    min-width: 0;
    margin-top: var(--space-4);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    line-height: var(--leading-body);
    text-align: left;
  }
  .resource-metadata.compact {
    margin-top: var(--space-3);
  }
  .facts,
  .tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
  }
  .facts {
    gap: var(--space-2) var(--space-6);
  }
  .facts:empty {
    display: none;
  }
  .tags {
    gap: var(--space-3);
  }
  .fact {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }
  .priority,
  .date[data-date-kind="due"] {
    color: var(--notice-ink);
  }
  .date-label {
    font-weight: var(--weight-medium);
  }
  .tag {
    font-size: var(--text-xs);
    font-weight: var(--weight-normal);
  }
</style>
