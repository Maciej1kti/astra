<script lang="ts">
  import { untrack } from "svelte";
  import { coarseClock } from "../../lib/ui/coarse-clock.svelte";
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
  const clock = coarseClock();
  const now = $derived(clock.now);
  const summary = $derived(cardScheduleSummary(fields, timezone, now));
  const cannotCollapse = $derived(expanded && !summary.valid);
</script>

<section class="card-schedule" aria-label="Harmonogram">
  <h3 class="schedule-heading">
    <Button
      type="button"
      variant="quiet"
      class="schedule-toggle"
      aria-label="Edytuj harmonogram"
      aria-describedby={`${id}-summary${!expanded && summary.detail ? ` ${id}-detail` : ""}`}
      aria-expanded={expanded}
      aria-controls={id}
      aria-disabled={cannotCollapse}
      title={cannotCollapse
        ? "Uzupełnij lub wyczyść harmonogram przed zwinięciem"
        : "Edytuj harmonogram"}
      onclick={() => {
        if (!cannotCollapse) expanded = !expanded;
      }}
    >
      <Icon name="calendar" small />
      <span
        id={`${id}-summary`}
        class="schedule-summary"
        class:overdue={summary.overdue}>{summary.text}</span
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
        ><Icon name="calendar" small />Wybierz daty<span aria-hidden="true"
          >↗</span
        ></Button
      >
      <div class="editor-properties card-properties">
        <label class="schedule-start">
          Początek<input
            type="date"
            bind:value={fields.start}
            disabled={locked || !expanded}
          />
        </label>
        {#if !fields.time}
          <label class="schedule-end">
            Koniec<input
              type="date"
              bind:value={fields.end}
              min={fields.start}
              disabled={locked || !expanded}
            />
          </label>
        {/if}
        <label class="schedule-time">
          Godzina rozpoczęcia<input
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
            Czas trwania (minuty)<input
              type="number"
              min="1"
              max="10080"
              step="1"
              bind:value={fields.duration}
              disabled={locked || !expanded}
            />
          </label>
          <p class="field-hint">Wydarzenie · {timezone}</p>
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
