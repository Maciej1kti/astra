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
    announcement = `${cardSections[section]} ${showing ? "widoczne" : "ukryte"} na tej karcie.`;
  }
</script>

<div class="card-layout-menu">
  <ActionMenu label="Dostosuj układ karty" icon="layout" {disabled}>
    {#snippet children(close)}
      <div class="layout-panel-heading">
        <strong>Układ karty</strong><Button
          type="button"
          variant="quiet"
          class="icon-button"
          aria-label="Zakończ układanie sekcji"
          onclick={close}><Icon name="check" /></Button
        >
      </div>
      <OrderVisibilityList
        order={layout}
        label={(section) => cardSections[section]}
        shown={(section) => !hidden.includes(section)}
        onmove={save}
        ontoggle={toggle}
        ariaLabel="Kolejność sekcji"
        bind:announcement
        {disabled}
        {visibilityDisabled}
        cancellationMessage="Kolejność sekcji bez zmian."
        rowAttribute="data-layout-section"
        handleAttribute="data-layout-handle"
      />
      <div class="layout-panel-footer">
        <p class="layout-hint">
          {stored
            ? "Kolejność w tej przeglądarce. Widoczność na tej karcie."
            : "Pamięć przeglądarki jest niedostępna. Ten układ pozostanie do zamknięcia karty."}
        </p>
        <Button
          type="button"
          variant="quiet"
          disabled={disabled || visibilityDisabled}
          onclick={() => {
            save(defaultCardLayout());
            hidden = [];
            announcement =
              "Przywrócono domyślną kolejność. Wszystkie sekcje są widoczne na tej karcie.";
          }}>Przywróć układ</Button
        >
      </div>
    {/snippet}
  </ActionMenu>
</div>
