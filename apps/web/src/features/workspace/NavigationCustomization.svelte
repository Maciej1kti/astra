<script lang="ts">
  import Button from "../../lib/ui/Button.svelte";
  import OrderVisibilityList from "../../lib/ui/OrderVisibilityList.svelte";
  import { viewLabel } from "./navigation";
  import {
    defaultNavigationLayout,
    type NavigationLayout,
  } from "./navigation-layout";

  let {
    layout,
    stored,
    onsave,
  }: {
    layout: NavigationLayout;
    stored: boolean;
    onsave: (next: NavigationLayout) => void;
  } = $props();
  let open = $state(false);
  let announcement = $state("");
  function toggle(item: NavigationLayout["order"][number]) {
    const showing = !layout.visible.includes(item);
    onsave({
      order: layout.order,
      visible: layout.order.filter((value) =>
        value === item ? showing : layout.visible.includes(value),
      ),
    });
    announcement = `${viewLabel(item)} ${showing ? "na pasku" : "poza paskiem"} nawigacji.`;
  }
</script>

<details
  class="navigation-customization"
  ontoggle={(event) => {
    open = event.currentTarget.open;
  }}
>
  <summary>Dostosuj nawigację</summary>
  {#if open}
    <p class="navigation-hint">
      Przeciągnij uchwyt, aby ułożyć skróty na dolnym pasku.
    </p>
    <OrderVisibilityList
      order={layout.order}
      label={viewLabel}
      shown={(item) => layout.visible.includes(item)}
      onmove={(order) =>
        onsave({
          order,
          visible: order.filter((item) => layout.visible.includes(item)),
        })}
      ontoggle={toggle}
      ariaLabel="Kolejność nawigacji"
      visibilityLabel={(item) => `Pokaż ${viewLabel(item)} na pasku nawigacji`}
      visibilityTitle={(item) =>
        `${layout.visible.includes(item) ? "Ukryj" : "Pokaż"} ${viewLabel(item)} na pasku nawigacji`}
      rowAttribute="data-navigation-item"
      handleAttribute="data-navigation-handle"
      bind:announcement
    />
    <p class="navigation-hint">
      {stored
        ? "Zapisano w tej przeglądarce."
        : "Pamięć przeglądarki jest niedostępna. Te ustawienia pozostaną do odświeżenia strony."}
    </p>
    <Button
      type="button"
      variant="quiet"
      onclick={() => {
        onsave(defaultNavigationLayout());
        announcement = "Przywrócono domyślną nawigację: Focus i Projekty.";
      }}>Przywróć nawigację</Button
    >
  {/if}
</details>
