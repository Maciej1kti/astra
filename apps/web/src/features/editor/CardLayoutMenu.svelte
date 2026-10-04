<script lang="ts">
  import { tick } from "svelte";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import { layoutMotion } from "../../lib/ui/layout-motion";
  import {
    cardSections,
    defaultCardLayout,
    writeCardLayout,
    type CardLayout,
    type CardSection,
  } from "./card-layout";
  import { cardLayoutGesture } from "./card-layout-gesture";

  let {
    layout = $bindable(),
    hidden = $bindable(),
    disabled = false,
    visibilityDisabled = false,
  }: {
    layout: CardLayout;
    hidden: CardSection[];
    disabled?: boolean;
    visibilityDisabled?: boolean;
  } = $props();
  const id = $props.id();
  let list: HTMLOListElement | undefined;
  let announcement = $state("");
  let stored = $state(true);
  function save(next: CardLayout) {
    layout = next;
    stored = writeCardLayout(next);
  }
  async function move(next: CardLayout, section: CardSection) {
    save(next);
    announcement = `${cardSections[section]} moved to position ${layout.indexOf(section) + 1} of ${layout.length}.`;
    await tick();
    const handle = list?.querySelector<HTMLButtonElement>(
      `[data-layout-handle="${section}"]`,
    );
    handle?.focus({ preventScroll: true });
    handle?.scrollIntoView({ block: "nearest" });
  }
  function toggle(section: CardSection) {
    const showing = hidden.includes(section);
    hidden = showing
      ? hidden.filter((value) => value !== section)
      : defaultCardLayout().filter(
          (value) => hidden.includes(value) || value === section,
        );
    announcement = `${cardSections[section]} ${showing ? "shown" : "hidden"} on this card.`;
  }
</script>

<div class="card-layout-menu">
  <ActionMenu label="Customize card layout" icon="layout" {disabled}>
    {#snippet children(close)}
      <div class="layout-panel-heading">
        <strong>Card layout</strong><Button
          type="button"
          variant="quiet"
          class="icon-button"
          aria-label="Done arranging sections"
          onclick={close}><Icon name="check" /></Button
        >
      </div>
      <span class="sr" id={`${id}-reorder-help`}>
        Drag the handle to arrange sections. Use the arrow keys, Home or End to
        move a focused handle. Escape cancels a drag.
      </span>
      <ol
        class="layout-order"
        aria-label="Section order"
        bind:this={list}
        use:cardLayoutGesture={{
          order: () => layout,
          disabled: () => disabled,
          commit: (next, section) => void move(next, section),
          announce: (message) => (announcement = message),
        }}
      >
        {#each layout as section (section)}
          <li
            animate:layoutMotion
            data-layout-section={section}
            class:section-muted={hidden.includes(section)}
          >
            <Button
              type="button"
              variant="quiet"
              class="icon-button layout-handle"
              {disabled}
              data-layout-handle={section}
              aria-label={`Reorder ${cardSections[section]}`}
              aria-describedby={`${id}-reorder-help`}
              aria-keyshortcuts="ArrowUp ArrowDown Home End"
              aria-pressed="false"><Icon name="grip" small /></Button
            >
            <span class="layout-section-name">{cardSections[section]}</span>
            <Button
              type="button"
              variant="quiet"
              class="icon-button layout-visibility"
              disabled={disabled || visibilityDisabled}
              aria-label={`Show ${cardSections[section]}`}
              title={`${hidden.includes(section) ? "Show" : "Hide"} ${cardSections[section]}`}
              aria-pressed={!hidden.includes(section)}
              onclick={() => toggle(section)}
              ><Icon
                name={hidden.includes(section) ? "eyeOff" : "eye"}
              /></Button
            >
          </li>
        {/each}
      </ol>
      <div class="layout-panel-footer">
        <p class="layout-hint">
          {stored
            ? "Order in this browser. Visibility on this card."
            : "Browser storage is unavailable. This layout lasts until you close the card."}
        </p>
        <Button
          type="button"
          variant="quiet"
          disabled={disabled || visibilityDisabled}
          onclick={() => {
            save(defaultCardLayout());
            hidden = [];
            announcement =
              "Default order restored. All sections shown on this card.";
          }}>Reset layout</Button
        >
      </div>
      <span class="sr" role="status">{announcement}</span>
    {/snippet}
  </ActionMenu>
</div>
