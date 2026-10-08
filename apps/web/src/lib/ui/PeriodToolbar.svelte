<script lang="ts">
  import type { Snippet } from "svelte";
  import { controlsLayers, revealLayers } from "./motion-layers";
  import ActionMenu from "./ActionMenu.svelte";
  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";

  /**
   * The toolbar of a view laid out over time: the period in view with a date
   * field behind it, Today, previous and next, then the view's own controls.
   * Calendar and Timeline share it, so both move through time the same way.
   */
  let {
    title,
    date,
    menuLabel,
    previousLabel,
    nextLabel,
    navigate,
    today,
    changeDate,
    children,
  }: {
    title: string;
    /** The day the date field opens on. */
    date: string;
    menuLabel: string;
    previousLabel: string;
    nextLabel: string;
    navigate: (delta: number) => void;
    today: () => void;
    changeDate: (input: HTMLInputElement) => void;
    /** Controls of the view itself, such as its layout or scale. */
    children?: Snippet;
  } = $props();
</script>

<div class="period-toolbar" use:revealLayers={controlsLayers}>
  <div class="period-title">
    <ActionMenu label={menuLabel} text={title} icon="chevronDown" align="start">
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
      aria-label={previousLabel}
      onclick={() => navigate(-1)}><Icon name="chevronLeft" /></Button
    >
    <Button
      variant="quiet"
      class="icon-button next"
      aria-label={nextLabel}
      onclick={() => navigate(1)}><Icon name="chevronRight" /></Button
    >
  </div>
  {#if children}<div class="controls">{@render children()}</div>{/if}
</div>

<style>
  .period-toolbar {
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
  .controls {
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
  .controls {
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  @media (max-width: 1100px) {
    .period-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4) var(--space-2);
    }
    .controls {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 700px) {
    .period-title :global(.action-menu-labeled) {
      gap: var(--space-3);
    }
    /* The view's main choice takes the row; a further one keeps its size. */
    .controls > :global(.segments:first-child) {
      flex: 1 1 100%;
    }
    .controls :global(.segments button) {
      --segments-inline: var(--space-3);
      font-size: var(--text-lg);
    }
  }
</style>
