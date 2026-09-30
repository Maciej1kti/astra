<script lang="ts">
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import { widgetDate } from "./planning";
  import { isCalendarDate, type CalendarLayout } from "./planning-navigation";

  let {
    date,
    mode,
    compact,
    monthGrid,
    project,
    navigate,
    today,
    changeDate,
    changeLayout,
    changeMonthGrid,
    create,
  }: {
    date: string;
    mode: CalendarLayout;
    compact: boolean;
    monthGrid: boolean;
    project: string;
    navigate: (delta: number) => void;
    today: () => void;
    changeDate: (input: HTMLInputElement) => void;
    changeLayout: (mode: CalendarLayout) => void;
    changeMonthGrid: (grid: boolean) => void;
    create: () => void;
  } = $props();
  const monthFormat = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  });
  const title = $derived(monthFormat.format(widgetDate(date)));
</script>

<div class="calendar-toolbar">
  <div class="period-title">
    <ActionMenu
      label="Choose calendar date"
      text={title}
      icon="chevronDown"
      align="start"
    >
      {#snippet children(close)}
        <label class="date-control"
          >Go to date<input
            type="date"
            aria-label="Go to date"
            value={date}
            onchange={(event) => changeDate(event.currentTarget)}
            required
          /></label
        >
        <Button variant="quiet" onclick={close}>Done</Button>
      {/snippet}
    </ActionMenu>
  </div>
  <div class="navigation">
    <Button variant="quiet" class="today" onclick={today}>Today</Button>
    <Button
      variant="quiet"
      class="icon-button previous"
      aria-label="Previous calendar period"
      onclick={() => navigate(-1)}><Icon name="chevronDown" /></Button
    >
    <Button
      variant="quiet"
      class="icon-button next"
      aria-label="Next calendar period"
      onclick={() => navigate(1)}><Icon name="chevronDown" /></Button
    >
  </div>
  <div class="view-controls">
    <select
      aria-label="Calendar layout"
      value={mode}
      onchange={(event) =>
        changeLayout(event.currentTarget.value as CalendarLayout)}
    >
      <option value="day">Day</option><option value="week">Week</option><option
        value="month">Month</option
      ><option value="agenda">Agenda</option>
    </select>
    {#if compact && mode === "month"}
      <div class="month-display" role="group" aria-label="Month display">
        <Button
          variant="quiet"
          class="icon-button"
          aria-label="Agenda"
          title="Agenda"
          aria-pressed={!monthGrid}
          onclick={() => changeMonthGrid(false)}
          ><Icon name="list" small /></Button
        >
        <Button
          variant="quiet"
          class="icon-button"
          aria-label="Month grid"
          title="Month grid"
          aria-pressed={monthGrid}
          onclick={() => changeMonthGrid(true)}
          ><Icon name="calendar" small /></Button
        >
      </div>
    {/if}
    {#if project}
      <Button
        variant="quiet"
        class="create-scheduled"
        aria-label="New scheduled card"
        title="New scheduled card"
        disabled={!isCalendarDate(date)}
        onclick={create}><Icon name="plus" small /><span>New card</span></Button
      >
    {/if}
  </div>
</div>

<style>
  .calendar-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin-bottom: var(--space-8);
    min-width: 0;
  }
  .period-title {
    flex: 1;
    min-width: 0;
  }
  .period-title :global(.action-menu-labeled) {
    flex-direction: row-reverse;
    justify-content: flex-end;
    max-width: 100%;
    padding-inline: 0;
    font-size: var(--text-section);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
    text-align: left;
  }
  .period-title :global(.action-menu-labeled span) {
    white-space: normal;
    line-height: var(--leading-tight);
  }
  .period-title :global(.action-menu-labeled .ui-icon) {
    width: var(--icon-small);
    height: var(--icon-small);
    color: var(--muted);
  }
  .period-title :global(.action-menu-panel) {
    width: var(--field-width);
    z-index: var(--layer-floating);
  }
  .date-control {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-4);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .date-control input {
    width: 100%;
    font-size: var(--text-lg);
  }
  .navigation,
  .view-controls,
  .month-display {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .navigation {
    gap: var(--space-1);
  }
  .navigation :global(.today) {
    min-width: 60px;
    padding-inline: var(--space-5);
    font-size: var(--text-label);
  }
  .navigation :global(.previous .ui-icon) {
    transform: rotate(90deg);
  }
  .navigation :global(.next .ui-icon) {
    transform: rotate(-90deg);
  }
  .view-controls {
    gap: var(--space-6);
  }
  select {
    min-width: 110px;
    min-height: var(--tap-target);
    font-size: var(--text-label);
    background: var(--soft);
    border-color: transparent;
    cursor: pointer;
  }
  .month-display {
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-control);
    background: var(--soft);
  }
  .month-display :global(button) {
    color: var(--muted);
  }
  .month-display :global(button[aria-pressed="true"]) {
    background: var(--paper);
    color: var(--accent-ink);
    box-shadow: var(--shadow-sm);
  }
  .view-controls :global(.create-scheduled) {
    font-size: var(--text-label);
    padding-inline: var(--space-5);
    white-space: nowrap;
  }
  @media (max-width: 1100px) {
    .calendar-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4) var(--space-2);
    }
    .view-controls {
      grid-column: 1 / -1;
    }
    .view-controls :global(.create-scheduled) {
      margin-left: auto;
    }
  }
  @media (max-width: 720px) {
    .period-title :global(.action-menu-labeled) {
      font-size: var(--text-xl);
      gap: var(--space-3);
    }
    .view-controls {
      gap: var(--space-4);
    }
    select {
      flex: 1;
      min-width: 0;
      font-size: var(--text-lg);
    }
    .view-controls :global(.create-scheduled) {
      min-width: var(--tap-target);
      padding-inline: var(--space-5);
    }
  }
  @media (max-width: 360px) {
    .view-controls :global(.create-scheduled span) {
      display: none;
    }
  }
</style>
