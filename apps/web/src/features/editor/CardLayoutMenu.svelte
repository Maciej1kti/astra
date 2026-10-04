<script lang="ts">
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import OrderVisibilityList from "../../lib/ui/OrderVisibilityList.svelte";
  import {
    cardSections,
    defaultCardLayout,
    writeCardLayout,
    type CardLayout,
    type CardSection,
  } from "./card-layout";

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
  let announcement = $state("");
  let stored = $state(true);
  function save(next: CardLayout) {
    layout = next;
    stored = writeCardLayout(next);
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
      <OrderVisibilityList
        order={layout}
        label={(section) => cardSections[section]}
        shown={(section) => !hidden.includes(section)}
        onmove={save}
        ontoggle={toggle}
        ariaLabel="Section order"
        bind:announcement
        {disabled}
        {visibilityDisabled}
        cancellationMessage="Section order unchanged."
        rowAttribute="data-layout-section"
        handleAttribute="data-layout-handle"
      />
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
    {/snippet}
  </ActionMenu>
</div>
