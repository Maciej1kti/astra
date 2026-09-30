<script lang="ts">
  import { onMount, untrack } from "svelte";
  import ScheduleCalendar from "./ScheduleCalendar.svelte";
  import { counterDay } from "../cards/card-counters";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import { cardScheduleSummary } from "./card-schedule";
  import type { CardFields } from "./editor-draft";

  let {
    fields = $bindable(),
    locked,
    timezone,
    weekStart,
    initiallyExpanded = false,
  }: {
    fields: CardFields;
    locked: boolean;
    timezone: string;
    weekStart: string;
    initiallyExpanded?: boolean;
  } = $props();
  const id = $props.id();
  let calendarOpen = $state(false);
  let expanded = $state(untrack(() => initiallyExpanded));
  let now = $state(Date.now());
  const summary = $derived(cardScheduleSummary(fields, timezone, now));
  const cannotCollapse = $derived(expanded && !summary.valid);
  onMount(() => {
    const refresh = () => {
      now = Date.now();
    };
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  });
</script>

<section class="card-schedule" aria-label="Schedule">
  <h3 class="schedule-heading">
    <Button
      type="button"
      variant="quiet"
      class="schedule-toggle"
      aria-label="Edit schedule"
      aria-describedby={`${id}-summary${!expanded && summary.detail ? ` ${id}-detail` : ""}`}
      aria-expanded={expanded}
      aria-controls={id}
      aria-disabled={cannotCollapse}
      title={cannotCollapse
        ? "Complete or clear the schedule before collapsing it"
        : "Edit schedule"}
      onclick={() => {
        if (!cannotCollapse) expanded = !expanded;
      }}
    >
      <Icon name="calendar" small />
      <span
        id={`${id}-summary`}
        class="schedule-summary"
        class:overdue={summary.overdue}
        >{expanded ? "Schedule" : summary.text}</span
      >
      {#if !expanded && summary.detail}<span
          id={`${id}-detail`}
          class="schedule-detail">{summary.detail}</span
        >{/if}
      <span class="schedule-chevron" class:expanded
        ><Icon name="chevronDown" small /></span
      >
    </Button>
  </h3>
  <div
    class="schedule-disclosure"
    class:expanded
    {id}
    inert={!expanded}
    aria-hidden={!expanded}
  >
    <div class="schedule-disclosure-inner">
      <Button
        type="button"
        variant="quiet"
        class="schedule-calendar-trigger"
        disabled={locked || !expanded}
        onclick={(event) => {
          // WebKit does not focus a button on pointer clicks. The modal restores
          // this explicit trigger focus when its local proposal closes.
          event.currentTarget.focus({ preventScroll: true });
          calendarOpen = true;
        }}
        ><Icon name="calendar" small />Choose dates<span aria-hidden="true"
          >↗</span
        ></Button
      >
      <div class="editor-properties card-properties">
        <label class="schedule-start">
          Start<input
            type="date"
            bind:value={fields.start}
            disabled={locked || !expanded}
          />
        </label>
        {#if !fields.time}
          <label class="schedule-end">
            End<input
              type="date"
              bind:value={fields.end}
              min={fields.start}
              disabled={locked || !expanded}
            />
          </label>
        {/if}
        <label class="schedule-time">
          Start time<input
            type="time"
            oninput={(event) => {
              if (!event.currentTarget.value) fields.end = fields.start;
            }}
            bind:value={fields.time}
            disabled={locked || !expanded}
          />
        </label>
        {#if fields.time}
          <label class="schedule-duration">
            Duration (minutes)<input
              type="number"
              min="1"
              max="10080"
              step="1"
              bind:value={fields.duration}
              disabled={locked || !expanded}
            />
          </label>
          <p class="field-hint">Event · {timezone}</p>
        {/if}
      </div>
    </div>
  </div>
</section>

{#if calendarOpen}
  <ScheduleCalendar
    start={fields.start}
    end={fields.end}
    single={!!fields.time}
    {locked}
    {weekStart}
    today={counterDay(timezone, now)}
    onclose={() => {
      calendarOpen = false;
    }}
    onapply={(range) => {
      fields.start = range.start;
      fields.end = range.end;
      if (!range.start) fields.time = "";
      calendarOpen = false;
    }}
  />
{/if}
