<script lang="ts">
  import { controlsLayers, revealLayers } from "../../lib/ui/motion-layers";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import type { TimelineScale } from "./timeline-scale";

  let {
    month,
    title,
    scale,
    today,
    navigate,
    showToday,
    showDate,
    changeScale,
  }: {
    /** The month in view, which the date field opens on. */
    month: string;
    title: string;
    scale: TimelineScale;
    today: string;
    navigate: (delta: number) => void;
    showToday: () => void;
    showDate: (date: string) => void;
    changeScale: (scale: TimelineScale) => void;
  } = $props();
  const scales: [TimelineScale, string][] = [
    ["days", "Dni"],
    ["weeks", "Tygodnie"],
    ["months", "Miesiące"],
  ];
</script>

<div class="timeline-toolbar" use:revealLayers={controlsLayers}>
  <div class="period-title">
    <ActionMenu
      label="Wybierz datę na osi czasu"
      text={title}
      icon="chevronDown"
      align="start"
    >
      {#snippet children(close)}
        <label class="date-control"
          >Przejdź do daty<input
            type="date"
            aria-label="Przejdź do daty"
            value={today.startsWith(month) ? today : `${month}-01`}
            onchange={(event) => showDate(event.currentTarget.value)}
            required
          /></label
        >
        <Button variant="quiet" onclick={close}>Gotowe</Button>
      {/snippet}
    </ActionMenu>
  </div>
  <div class="navigation">
    <Button variant="quiet" class="today" onclick={showToday}>Dzisiaj</Button>
    <Button
      variant="quiet"
      class="icon-button"
      aria-label="Poprzedni miesiąc"
      onclick={() => navigate(-1)}><Icon name="chevronLeft" /></Button
    >
    <Button
      variant="quiet"
      class="icon-button"
      aria-label="Następny miesiąc"
      onclick={() => navigate(1)}><Icon name="chevronRight" /></Button
    >
  </div>
  <div class="scales" role="group" aria-label="Skala osi czasu">
    {#each scales as [value, name] (value)}
      <button
        type="button"
        aria-pressed={scale === value}
        onclick={() => changeScale(value)}>{name}</button
      >
    {/each}
  </div>
</div>

<style>
  .timeline-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin-bottom: var(--space-6);
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
  .navigation {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }
  .navigation :global(.today) {
    min-width: var(--space-20);
    padding-inline: var(--space-5);
    font-size: var(--text-base);
  }
  .scales {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-control);
    background: var(--soft);
  }
  .scales button {
    min-height: calc(var(--tap-target) - var(--space-2));
    padding: 0 var(--space-7);
    border-color: transparent;
    border-radius: calc(var(--radius-control) - var(--space-1));
    background: transparent;
    color: var(--muted);
    font-size: var(--text-base);
    transition:
      background var(--motion-quick) var(--motion-ease),
      color var(--motion-quick) var(--motion-ease),
      box-shadow var(--motion-quick) var(--motion-ease);
  }
  .scales button:hover {
    color: var(--ink);
  }
  .scales button[aria-pressed="true"] {
    background: var(--paper);
    color: var(--ink);
    font-weight: var(--weight-medium);
    box-shadow: var(--shadow-sm);
  }
  @media (max-width: 700px) {
    .timeline-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4) var(--space-2);
    }
    .scales {
      grid-column: 1 / -1;
    }
    .scales button {
      flex: 1;
      padding-inline: var(--space-4);
      font-size: var(--text-lg);
    }
  }
</style>
