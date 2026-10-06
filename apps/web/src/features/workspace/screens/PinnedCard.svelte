<script lang="ts">
  import { counted } from "../../../lib/ui/locale.ts";
  import Icon from "../../../lib/ui/Icon.svelte";
  import Badge from "../../../lib/ui/Badge.svelte";
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import { cardScheduleSummary } from "../../editor/card-schedule";
  import FocusCounterChip from "../../cards/FocusCounterChip.svelte";
  import type { FocusCounterSnapshot } from "../../cards/focus-counter-controller";
  import type { DailyCounterSummary } from "../../../lib/contracts/api.generated";
  import type { Summary } from "../../../lib/api/api";
  let {
    item,
    projectName,
    reorderable = false,
    pinned = true,
    today,
    timezone,
    now,
    counterState,
    oncounter,
    open,
  }: {
    item: Summary & { attentionReasons?: string[] };
    projectName: string;
    reorderable?: boolean;
    pinned?: boolean;
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
  // All previews of one card show the same observed workspace day.
  const counterDate = $derived(item.daily_counters?.[0]?.date);
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
  data-focus-card={pinned ? item.id : undefined}
  data-focus-project={pinned ? item.project_id : undefined}
  data-focus-key={pinned ? `${item.project_id}:${item.id}` : undefined}
  data-focus-reorderable={pinned && item.availability !== "unavailable"
    ? ""
    : undefined}
  aria-labelledby={id}
>
  <button
    class="focus-card-open"
    type="button"
    onclick={open}
    aria-describedby={reorderable ? "focus-order-help" : undefined}
    aria-keyshortcuts={!pinned || item.availability === "unavailable"
      ? undefined
      : "Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End"}
  >
    <span class="focus-card-context"
      >{#if pinned}<Icon name="pin" small />{/if}<span>{projectName}</span>
      {#if item.status}<Badge class="state" data-state={item.status}
          >{resourceLabel(item.status)}</Badge
        >{/if}
      {#if item.priority === "high"}<span
          class="focus-high"
          title="Wysoki priorytet"
          ><Icon name="flag" small /><span class="sr">Wysoki priorytet</span
          ></span
        >{/if}
      {#if pinned && reorderable}<span class="focus-card-grip"
          ><Icon name="grip" small /></span
        >{/if}
    </span>
    <span class="focus-card-title" {id} role="heading" aria-level="3"
      >{item.title}</span
    >
    <span class="focus-card-facts">
      {#if item.archived}<span>Zarchiwizowane</span>{/if}
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
      {#if item.acceptance_progress?.total}<span title="Lista kontrolna"
          ><Icon name="check" small /><span class="sr"
            >Lista kontrolna:&nbsp;</span
          >{item.acceptance_progress.completed}/{item.acceptance_progress
            .total}</span
        >{/if}
      {#if item.comment_count}<span
          >{counted(
            item.comment_count,
            "komentarz",
            "komentarze",
            "komentarzy",
          )}</span
        >{/if}
      {#if item.counter_count && !item.daily_counters?.length}<span
          >{counted(
            item.counter_count,
            "licznik",
            "liczniki",
            "liczników",
          )}</span
        >{/if}
    </span>
    {#if item.labels?.length}<span class="focus-card-labels"
        >{#each item.labels as label}<span>{label}</span>{/each}</span
      >{/if}
    {#if item.attentionReasons?.some((reason) => reason !== "overdue")}<span
        class="attention-reasons"
        aria-label="Powody wymagające uwagi"
        >{#each item.attentionReasons.filter((reason) => reason !== "overdue") as reason}<Badge
            >{resourceLabel(reason)}</Badge
          >{/each}</span
      >{/if}
  </button>
  {#if item.daily_counters?.length}
    <div
      class="focus-card-counters"
      aria-label="Dzienne liczniki"
      role="group"
      data-focus-interactive
    >
      <span class="focus-counter-day"
        >{counterDate === today ? "Dzisiaj" : counterDate}</span
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
