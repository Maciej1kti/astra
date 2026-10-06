<script lang="ts">
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import type { CalendarLayout } from "./planning-navigation";
  import { widgetDate } from "./widget-dates";

  let {
    date,
    mode,
    compact,
    monthGrid,
    navigate,
    today,
    changeDate,
    changeLayout,
    changeMonthGrid,
  }: {
    date: string;
    mode: CalendarLayout;
    compact: boolean;
    monthGrid: boolean;
    navigate: (delta: number) => void;
    today: () => void;
    changeDate: (input: HTMLInputElement) => void;
    changeLayout: (mode: CalendarLayout) => void;
    changeMonthGrid: (grid: boolean) => void;
  } = $props();
  const monthFormat = new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  });
  const title = $derived(monthFormat.format(widgetDate(date)));
</script>

<div class="calendar-toolbar">
  <div class="period-title">
    <ActionMenu
      label="Wybierz datę kalendarza"
      text={title}
      icon="chevronDown"
      align="start"
    >
      {#snippet children(close)}
        <label class="date-control"
          >Przejdź do daty<input
            type="date"
            aria-label="Przejdź do daty"
            value={date}
            onchange={(event) => changeDate(event.currentTarget)}
            required
          /></label
        >
        <Button variant="quiet" onclick={close}>Gotowe</Button>
      {/snippet}
    </ActionMenu>
  </div>
  <div class="navigation">
    <Button variant="quiet" class="today" onclick={today}>Dzisiaj</Button>
    <Button
      variant="quiet"
      class="icon-button previous"
      aria-label="Poprzedni okres kalendarza"
      onclick={() => navigate(-1)}><Icon name="chevronLeft" /></Button
    >
    <Button
      variant="quiet"
      class="icon-button next"
      aria-label="Następny okres kalendarza"
      onclick={() => navigate(1)}><Icon name="chevronRight" /></Button
    >
  </div>
  <div class="view-controls">
    <select
      aria-label="Układ kalendarza"
      value={mode}
      onchange={(event) =>
        changeLayout(event.currentTarget.value as CalendarLayout)}
    >
      <option value="day">Dzień</option><option value="week">Tydzień</option
      ><option value="month">Miesiąc</option><option value="agenda"
        >Agenda</option
      >
    </select>
    {#if compact && mode === "month"}
      <div class="month-display" role="group" aria-label="Widok miesiąca">
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
          aria-label="Siatka miesiąca"
          title="Siatka miesiąca"
          aria-pressed={monthGrid}
          onclick={() => changeMonthGrid(true)}
          ><Icon name="calendar" small /></Button
        >
      </div>
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
    font-size: var(--text-xl);
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
    min-width: var(--space-20);
    padding-inline: var(--space-5);
    font-size: var(--text-base);
  }
  .view-controls {
    gap: var(--space-6);
  }
  select {
    min-width: var(--field-compact);
    min-height: var(--tap-target);
    font-size: var(--text-base);
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
  @media (max-width: 1100px) {
    .calendar-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4) var(--space-2);
    }
    .view-controls {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 700px) {
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
  }
</style>
