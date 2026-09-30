<script lang="ts">
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import { layoutMotion } from "../../lib/ui/layout-motion";
  import {
    cardSections,
    defaultCardLayout,
    moveCardSection,
    writeCardLayout,
    type CardLayout,
    type CardSection,
    type LayoutGroup,
  } from "./card-layout";

  let {
    layout = $bindable(),
    disabled = false,
  }: { layout: CardLayout; disabled?: boolean } = $props();
  let announcement = $state("");
  let stored = $state(true);
  const groups: { key: LayoutGroup; label: string }[] = [
    { key: "content", label: "Content" },
    { key: "properties", label: "Properties" },
  ];
  function save(next: CardLayout) {
    layout = next;
    stored = writeCardLayout(next);
  }
  function move(group: LayoutGroup, section: CardSection, direction: -1 | 1) {
    save(moveCardSection(layout, group, section, direction));
    announcement = `${cardSections[section]} moved to position ${layout[group].indexOf(section) + 1} of ${layout[group].length}.`;
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
      <p class="layout-hint">Choose the order that works for you.</p>
      {#each groups as group}
        <div
          class="layout-group"
          role="group"
          aria-label={`${group.label} order`}
        >
          <p class="layout-group-label">{group.label}</p>
          <ol>
            {#each layout[group.key] as section, index (section)}
              <li animate:layoutMotion>
                <span class="layout-position" aria-hidden="true"
                  >{index + 1}</span
                >
                <span class="layout-section-name">{cardSections[section]}</span>
                <Button
                  type="button"
                  variant="quiet"
                  class="icon-button"
                  aria-label={`Move ${cardSections[section]} up`}
                  aria-disabled={index === 0}
                  onclick={() => index > 0 && move(group.key, section, -1)}
                  ><Icon name="chevronUp" /></Button
                >
                <Button
                  type="button"
                  variant="quiet"
                  class="icon-button"
                  aria-label={`Move ${cardSections[section]} down`}
                  aria-disabled={index === layout[group.key].length - 1}
                  onclick={() =>
                    index < layout[group.key].length - 1 &&
                    move(group.key, section, 1)}
                  ><Icon name="chevronDown" /></Button
                >
              </li>
            {/each}
          </ol>
        </div>
      {/each}
      <div class="layout-panel-footer">
        <p class="layout-hint">
          {stored
            ? "For all cards in this browser."
            : "Browser storage is unavailable. This layout lasts until you close the card."}
        </p>
        <Button
          type="button"
          variant="quiet"
          onclick={() => {
            save(defaultCardLayout());
            announcement = "Default section order restored.";
          }}>Reset layout</Button
        >
      </div>
      <span class="sr-only" role="status">{announcement}</span>
    {/snippet}
  </ActionMenu>
</div>
