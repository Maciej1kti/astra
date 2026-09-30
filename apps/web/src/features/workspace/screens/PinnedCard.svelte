<script lang="ts">
  import Icon from "../../../lib/ui/Icon.svelte";
  import Badge from "../../../lib/ui/Badge.svelte";
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import { cardScheduleSummary } from "../../editor/card-schedule";
  import FocusCounterChip from "../../cards/FocusCounterChip.svelte";
  import type { FocusCounterSnapshot } from "../../cards/focus-counter-controller";
  import type { DailyCounterSummary } from "../../../lib/contracts/api.generated";
  import type { Summary } from "../../../lib/api/api";
  import type { FocusCard } from "./focus-sections";
  let {
    item,
    projectName,
    reorderable,
    today,
    timezone,
    now,
    counterState,
    oncounter,
    open,
  }: {
    item: FocusCard;
    projectName: string;
    reorderable: boolean;
    today: string;
    timezone: string;
    now: number;
    counterState: FocusCounterSnapshot;
    oncounter: (
      item: Summary,
      counter: DailyCounterSummary,
      value: number,
      focus?: boolean,
    ) => void;
    open: () => void;
  } = $props();
  const id = $props.id();
  const schedule = $derived(
    cardScheduleSummary(
      {
        start: item.event?.start.slice(0, 10) ?? item.schedule?.start ?? "",
        end: item.schedule?.end ?? "",
        time: item.event?.start.slice(11) ?? "",
        duration: item.event?.duration_minutes ?? 60,
        status: item.status as
          "planned" | "active" | "review" | "done" | "cancelled",
      },
      timezone,
      now,
    ),
  );
</script>

<article
  class="card focus-card focus-pin"
  tabindex="-1"
  data-focus-card={item.id}
  data-focus-project={item.project_id}
  data-focus-key={`${item.project_id}:${item.id}`}
  data-focus-reorderable={item.availability === "unavailable" ? undefined : ""}
  aria-labelledby={id}
>
  <button
    class="focus-card-open"
    type="button"
    onclick={open}
    aria-describedby={reorderable ? "focus-order-help" : undefined}
    aria-keyshortcuts={item.availability === "unavailable"
      ? undefined
      : "Alt+ArrowUp Alt+ArrowDown"}
  >
    <span class="focus-card-context"
      ><Icon name="pin" small /><span>{projectName}</span>
      {#if item.status}<Badge class="state" data-state={item.status}
          >{resourceLabel(item.status)}</Badge
        >{/if}
      {#if item.priority === "high"}<span
          class="focus-high"
          title="High priority"
          ><Icon name="flag" small /><span class="sr">High priority</span></span
        >{/if}
      <span class="focus-card-grip"><Icon name="grip" small /></span>
    </span>
    <span class="focus-card-title" {id} role="heading" aria-level="3"
      >{item.title}</span
    >
    <span class="focus-card-facts">
      {#if item.archived}<span>Archived</span>{/if}
      {#if item.availability !== "ready"}<span
          >{resourceLabel(item.availability ?? "stale")}</span
        >{/if}
      {#if item.schedule || item.event}<span class:overdue={schedule.overdue}
          ><Icon
            name="calendar"
            small
          />{schedule.text}{#if schedule.detail}<span class="focus-fact-detail"
              >· {schedule.detail}</span
            >{/if}</span
        >{/if}
      {#if item.acceptance_progress?.total}<span title="Checklist"
          ><Icon name="check" small />{item.acceptance_progress.completed}/{item
            .acceptance_progress.total}<span class="sr">
            checklist items</span
          ></span
        >{/if}
      {#if item.comment_count}<span
          >{item.comment_count}
          {item.comment_count === 1 ? "comment" : "comments"}</span
        >{/if}
      {#if item.counter_count && !item.daily_counters?.length}<span
          >{item.counter_count}
          {item.counter_count === 1 ? "counter" : "counters"}</span
        >{/if}
    </span>
    {#if item.labels?.length}<span class="focus-card-labels"
        >{#each item.labels as label}<span>{label}</span>{/each}</span
      >{/if}
    {#if item.attentionReasons.length}<span
        class="attention-reasons"
        aria-label="Attention reasons"
        >{#each item.attentionReasons as reason}<Badge
            >{resourceLabel(reason)}</Badge
          >{/each}</span
      >{/if}
  </button>
  {#if item.daily_counters?.length}
    <div
      class="focus-card-counters"
      aria-label="Daily counters"
      role="group"
      data-focus-interactive
    >
      <span class="focus-counter-day"
        >{item.daily_counters[0].date === today
          ? "Today"
          : item.daily_counters[0].date}</span
      >
      {#each item.daily_counters as counter (counter.id)}
        <FocusCounterChip
          {item}
          {counter}
          {today}
          snapshot={counterState}
          onchange={oncounter}
        />
      {/each}
    </div>
  {/if}
</article>
